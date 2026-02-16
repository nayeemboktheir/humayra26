const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function translateChunk(texts: string[], apiKey: string): Promise<string[]> {
  // Use numbered lines for reliable parsing
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
  
  // Parse numbered lines back
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
    // Process in chunks of 15 for reliability
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
  } catch (error) {
    console.error('Translation error:', error);
    return texts;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, page = 1, pageSize = 40 } = await req.json();

    if (!query) {
      return new Response(
        JSON.stringify({ success: false, error: 'Search query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('OTCOMMERCE_API_KEY');
    if (!apiKey) {
      console.error('OTCOMMERCE_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: '1688 API not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Searching 1688 via OTAPI for:', query);

    const framePosition = (page - 1) * pageSize;
    const xmlParams = `<SearchItemsParameters><ItemTitle>${query}</ItemTitle><Provider>Alibaba1688</Provider></SearchItemsParameters>`;

    const url = `https://otapi.net/service-json/SearchItemsFrame?instanceKey=${encodeURIComponent(apiKey)}&language=en&xmlParameters=${encodeURIComponent(xmlParams)}&framePosition=${framePosition}&frameSize=${pageSize}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('OTAPI error:', data);
      return new Response(
        JSON.stringify({ success: false, error: data?.ErrorMessage || `Request failed with status ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for OTAPI-level errors
    if (data?.ErrorCode && data.ErrorCode !== 'Ok' && data.ErrorCode !== 'None') {
      console.error('OTAPI error response:', data);
      return new Response(
        JSON.stringify({ success: false, error: data.ErrorMessage || data.ErrorCode }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const items = data?.Result?.Items?.Content || [];
    const totalCount = data?.Result?.Items?.TotalCount || 0;
    console.log('Search successful, items found:', items.length);

    // Batch translate titles to English
    if (items.length > 0) {
      const titles = items.map((item: any) => item?.Title || item?.OriginalTitle || '');
      const translated = await batchTranslate(titles);
      
      for (let i = 0; i < items.length; i++) {
        if (translated[i]) {
          items[i].Title = translated[i];
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, data, meta: { provider: 'otapi', totalCount } }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error searching 1688:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to search';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
