const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function translateChunk(texts: string[], apiKey: string): Promise<string[]> {
  const numbered = texts.map((t, i) => `${i + 1}. ${t}`).join('\n');

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash-lite',
      messages: [
        {
          role: 'system',
          content: `Translate each numbered line from Chinese/Russian to English for e-commerce.
Return exactly the same number of numbered lines in the same format: "N. translated text"
Keep brand names and model numbers as-is. If already English, return unchanged.`
        },
        { role: 'user', content: numbered }
      ],
      max_tokens: 4000,
      temperature: 0.1,
    }),
  });

  if (!response.ok) return texts;

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  
  const result = [...texts];
  const lines = content.split('\n').filter((l: string) => l.trim());
  for (const line of lines) {
    const match = line.match(/^(\d+)\.\s*(.+)$/);
    if (match) {
      const idx = parseInt(match[1], 10) - 1;
      if (idx >= 0 && idx < texts.length) {
        result[idx] = match[2].trim();
      }
    }
  }
  return result;
}

async function batchTranslate(texts: string[]): Promise<string[]> {
  if (!texts.length) return [];
  
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) return texts;

  try {
    const CHUNK_SIZE = 15;
    const result = [...texts];
    const promises: Promise<void>[] = [];

    for (let start = 0; start < texts.length; start += CHUNK_SIZE) {
      const end = Math.min(start + CHUNK_SIZE, texts.length);
      const chunk = texts.slice(start, end);
      const startIdx = start;
      
      promises.push(
        translateChunk(chunk, apiKey).then(translated => {
          for (let i = 0; i < translated.length; i++) {
            result[startIdx + i] = translated[i];
          }
        })
      );
    }

    await Promise.all(promises);
    return result;
  } catch {
    return texts;
  }
}

function translateItems(items: any[]): Promise<any[]> {
  if (!items.length) return Promise.resolve(items);
  
  const titles = items.map((item: any) => item?.Title || item?.OriginalTitle || '');
  const locations = items.map((item: any) => item?.Location?.State || item?.Location?.City || '');
  
  const allTexts = [...titles, ...locations.filter(Boolean)];
  
  return batchTranslate(allTexts).then(translated => {
    for (let i = 0; i < items.length; i++) {
      if (translated[i]) items[i].Title = translated[i];
    }
    let locIdx = 0;
    for (let i = 0; i < items.length; i++) {
      const loc = items[i]?.Location?.State || items[i]?.Location?.City || '';
      if (loc) {
        const translatedLoc = translated[titles.length + locIdx];
        if (translatedLoc && items[i].Location) {
          if (items[i].Location.State) items[i].Location.State = translatedLoc;
          else if (items[i].Location.City) items[i].Location.City = translatedLoc;
        }
        locIdx++;
      }
    }
    return items;
  });
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

    const apiKey = (Deno.env.get('OTCOMMERCE_API_KEY') ?? '').trim();
    if (!apiKey) {
      return new Response(JSON.stringify({ success: false, error: '1688 API not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Image search: using AI to derive keywords...');
    return await aiKeywordSearch(imageBase64, apiKey, page, pageSize);
  } catch (error) {
    console.error('Error in image search:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed to search by image' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function aiKeywordSearch(imageBase64: string, apiKey: string, page: number, pageSize: number) {
  const lovableKey = (Deno.env.get('LOVABLE_API_KEY') ?? '').trim();
  if (!lovableKey) {
    return new Response(JSON.stringify({ success: false, error: 'AI fallback not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const b = imageBase64.slice(0, 20);
  const mime = b.startsWith('/9j/') ? 'image/jpeg' : b.startsWith('iVBOR') ? 'image/png' : b.startsWith('UklGR') ? 'image/webp' : 'image/jpeg';
  const dataUrl = `data:${mime};base64,${imageBase64}`;

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
          content: 'You are an e-commerce product identifier for 1688.com. Given an image, produce a short English search query that would find the same product on 1688. Return ONLY valid JSON: {"query":"...","alt_queries":["...","..."]}',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Generate the best English keyword query for this product image.' },
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
    const framePosition = (page - 1) * pageSize;
    const xmlParams = `<SearchItemsParameters><ItemTitle>${q}</ItemTitle><Provider>Alibaba1688</Provider></SearchItemsParameters>`;
    const url = `https://otapi.net/service-json/SearchItemsFrame?instanceKey=${encodeURIComponent(apiKey)}&language=en&xmlParameters=${encodeURIComponent(xmlParams)}&framePosition=${framePosition}&frameSize=${pageSize}`;

    const resp = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
    const data = await resp.json().catch(() => null);
    lastData = data;

    if (!resp.ok) {
      return new Response(JSON.stringify({ success: false, error: data?.ErrorMessage || `Failed: ${resp.status}` }), {
        status: resp.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const items = data?.Result?.Items?.Content || [];
    if (items.length > 0) {
      // Translate items to English
      await translateItems(items);
      return new Response(JSON.stringify({ success: true, data, meta: { method: 'ai_keyword', query: q, altQueries, provider: 'otapi' } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  return new Response(JSON.stringify({ success: true, data: lastData, meta: { method: 'ai_keyword', query, altQueries, provider: 'otapi' } }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
