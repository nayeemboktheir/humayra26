const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function guessMimeType(base64: string): string {
  const b = base64.slice(0, 20);
  // JPEG magic bytes start with /9j/
  if (b.startsWith('/9j/')) return 'image/jpeg';
  // PNG magic bytes start with iVBOR
  if (b.startsWith('iVBOR')) return 'image/png';
  // WEBP: starts with UklGR (RIFF)
  if (b.startsWith('UklGR')) return 'image/webp';
  return 'image/jpeg';
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // fall through
  }

  // Try to find the first JSON object in the response
  const match = text.match(/\{[\s\S]*\}/m);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

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

    const apiKey = (Deno.env.get('ATP_1688_API_KEY') ?? '').trim();
    if (!apiKey) {
      console.error('ATP_1688_API_KEY not configured');
      return new Response(JSON.stringify({ success: false, error: '1688 API not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // The upstream provider's `upload_img` endpoint is currently rejecting our requests
    // (returns: "imgcode parameter is required" even when provided). To keep image search working,
    // we use a robust fallback: AI-assisted image -> Chinese keyword query -> standard 1688 text search.

    const lovableKey = (Deno.env.get('LOVABLE_API_KEY') ?? '').trim();
    if (!lovableKey) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(JSON.stringify({ success: false, error: 'AI not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const mime = guessMimeType(imageBase64);
    const dataUrl = `data:${mime};base64,${imageBase64}`;

    console.log('Deriving 1688 search query from image...');

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
            content:
              'You are an e-commerce product identifier for 1688.com. Given an image, produce a short Chinese search query that would find the same product on 1688. Return ONLY valid JSON with shape: {"query":"...","alt_queries":["...", "..."]}. No markdown, no extra keys.',
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
      console.error('AI Gateway error:', t);
      return new Response(JSON.stringify({ success: false, error: 'Failed to analyze image' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiJson = await aiRes.json();
    const aiText = aiJson?.choices?.[0]?.message?.content ?? '';
    const parsed = extractJsonObject(aiText);

    const query = typeof parsed?.query === 'string' ? parsed.query.trim() : '';
    const altQueries = Array.isArray(parsed?.alt_queries)
      ? (parsed!.alt_queries as unknown[])
          .filter((x) => typeof x === 'string')
          .map((x) => (x as string).trim())
          .filter(Boolean)
          .slice(0, 3)
      : [];

    if (!query) {
      console.error('AI did not return a usable query. Raw:', aiText);
      return new Response(JSON.stringify({ success: false, error: 'Could not derive a search query from the image' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Image-derived query:', query);

    // Try primary query; if empty results, try alternates
    const queriesToTry = [query, ...altQueries].slice(0, 4);

    let lastData: any = null;
    for (const q of queriesToTry) {
      const url = `https://api.icom.la/1688/api/call.php?api_key=${encodeURIComponent(apiKey)}&item_search&q=${encodeURIComponent(
        q
      )}&page=${page}&page_size=${pageSize}&lang=zh-CN`;

      const resp = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      const data = await resp.json().catch(() => null);
      lastData = data;

      if (!resp.ok) {
        console.error('1688 API error:', data);
        return new Response(
          JSON.stringify({ success: false, error: data?.error || `Request failed with status ${resp.status}` }),
          { status: resp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const count = data?.item?.items?.item?.length ?? 0;
      if (count > 0) {
        return new Response(JSON.stringify({ success: true, data, meta: { query: q, altQueries } }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // No results across all queries; still return success with last response
    return new Response(JSON.stringify({ success: true, data: lastData, meta: { query, altQueries } }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in image search:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to search by image';
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
