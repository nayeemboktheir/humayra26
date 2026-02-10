const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, page = 1, pageSize = 40 } = await req.json();

    if (!imageBase64) {
      return new Response(JSON.stringify({ success: false, error: 'Image is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = (Deno.env.get('OTCOMMERCE_API_KEY') ?? '').trim();
    if (!apiKey) {
      return new Response(JSON.stringify({ success: false, error: '1688 API not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 1: Upload image to get alicdn URL via 1688.upload_img
    console.log('Step 1: Uploading image to get alicdn URL...');
    const uploadUrl = `https://api.icom.la/1688/api/call.php?api_key=${encodeURIComponent(apiKey)}&upload_img&imgcode=${encodeURIComponent(imageBase64)}`;

    const uploadResp = await fetch(uploadUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    const uploadData = await uploadResp.json().catch(() => null);
    console.log('Upload response:', JSON.stringify(uploadData)?.substring(0, 500));

    // Extract the image URL from upload response
    const imgUrl = uploadData?.item?.url || uploadData?.url || uploadData?.item?.pic_url;

    if (!imgUrl) {
      console.error('Upload failed, no URL returned. Full response:', JSON.stringify(uploadData));
      
      // Fallback: use AI to derive keywords and do text search
      return await fallbackAISearch(imageBase64, apiKey, page, pageSize);
    }

    console.log('Step 2: Searching by image URL:', imgUrl);

    // Step 2: Search using the uploaded image URL via 1688.item_search_img
    const searchUrl = `https://api.icom.la/1688/api/call.php?api_key=${encodeURIComponent(apiKey)}&item_search_img&imgid=${encodeURIComponent(imgUrl)}&page=${page}&page_size=${pageSize}`;

    const searchResp = await fetch(searchUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    const searchData = await searchResp.json().catch(() => null);

    if (!searchResp.ok) {
      console.error('Image search API error:', searchData);
      return new Response(
        JSON.stringify({ success: false, error: searchData?.error || `Search failed: ${searchResp.status}` }),
        { status: searchResp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const count = searchData?.item?.items?.item?.length ?? 0;
    console.log('Image search results count:', count);

    if (count === 0) {
      // Fallback to AI keyword search if image search returned nothing
      console.log('No image search results, falling back to AI keyword search...');
      return await fallbackAISearch(imageBase64, apiKey, page, pageSize);
    }

    return new Response(JSON.stringify({ success: true, data: searchData, meta: { method: 'image' } }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in image search:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed to search by image' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Fallback: AI analyzes image -> Chinese keywords -> text search
async function fallbackAISearch(imageBase64: string, apiKey: string, page: number, pageSize: number) {
  const lovableKey = (Deno.env.get('LOVABLE_API_KEY') ?? '').trim();
  if (!lovableKey) {
    return new Response(JSON.stringify({ success: false, error: 'AI fallback not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Guess mime type from base64 prefix
  const b = imageBase64.slice(0, 20);
  const mime = b.startsWith('/9j/') ? 'image/jpeg' : b.startsWith('iVBOR') ? 'image/png' : b.startsWith('UklGR') ? 'image/webp' : 'image/jpeg';
  const dataUrl = `data:${mime};base64,${imageBase64}`;

  console.log('AI fallback: deriving keywords from image...');

  const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      temperature: 0.2,
      max_tokens: 300,
      messages: [
        {
          role: 'system',
          content: 'You are an e-commerce product identifier for 1688.com. Given an image, produce a short Chinese search query that would find the same product on 1688. Return ONLY valid JSON: {"query":"...","alt_queries":["...","..."]}',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Generate the best 1688 Chinese keyword query for this product image.' },
            { type: 'image_url', image_url: { url: dataUrl, detail: 'auto' } },
          ],
        },
      ],
    }),
  });

  if (!aiRes.ok) {
    const t = await aiRes.text();
    console.error('AI error:', t);
    return new Response(JSON.stringify({ success: false, error: 'Failed to analyze image' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const aiJson = await aiRes.json();
  const aiText = aiJson?.choices?.[0]?.message?.content ?? '';

  let parsed: any = null;
  try { parsed = JSON.parse(aiText); } catch {
    const m = aiText.match(/\{[\s\S]*\}/m);
    if (m) try { parsed = JSON.parse(m[0]); } catch { /* ignore */ }
  }

  const query = typeof parsed?.query === 'string' ? parsed.query.trim() : '';
  const altQueries = Array.isArray(parsed?.alt_queries)
    ? (parsed.alt_queries as unknown[]).filter((x) => typeof x === 'string').map((x) => (x as string).trim()).filter(Boolean).slice(0, 3)
    : [];

  if (!query) {
    return new Response(JSON.stringify({ success: false, error: 'Could not derive search query from image' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log('AI-derived query:', query);

  const queriesToTry = [query, ...altQueries].slice(0, 4);
  let lastData: any = null;

  for (const q of queriesToTry) {
    const url = `https://api.icom.la/1688/api/call.php?api_key=${encodeURIComponent(apiKey)}&item_search&q=${encodeURIComponent(q)}&page=${page}&page_size=${pageSize}&lang=zh-CN`;
    const resp = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
    const data = await resp.json().catch(() => null);
    lastData = data;

    if (!resp.ok) {
      return new Response(JSON.stringify({ success: false, error: data?.error || `Failed: ${resp.status}` }), {
        status: resp.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if ((data?.item?.items?.item?.length ?? 0) > 0) {
      return new Response(JSON.stringify({ success: true, data, meta: { method: 'ai_keyword', query: q, altQueries } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  return new Response(JSON.stringify({ success: true, data: lastData, meta: { method: 'ai_keyword', query, altQueries } }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
