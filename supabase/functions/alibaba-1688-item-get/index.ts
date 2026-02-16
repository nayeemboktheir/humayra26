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
    const { numIid } = await req.json();

    if (!numIid) {
      return new Response(
        JSON.stringify({ success: false, error: 'Product ID (numIid) is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('OTCOMMERCE_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: '1688 API not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1688 items require the "abb-" prefix per OTAPI docs
    const itemId = String(numIid).startsWith('abb-') ? String(numIid) : `abb-${numIid}`;

    console.log('Getting 1688 product details via BatchGetItemFullInfo for:', itemId);

    const url = `https://otapi.net/service-json/BatchGetItemFullInfo?instanceKey=${encodeURIComponent(apiKey)}&language=en&itemId=${encodeURIComponent(itemId)}&blockList=Description`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    const data = await response.json();

    if (!response.ok) {
      const err = data?.ErrorDescription || data?.ErrorMessage || `Request failed: ${response.status}`;
      console.error('OTAPI HTTP error:', err);
      return new Response(
        JSON.stringify({ success: false, error: err }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (data?.ErrorCode && data.ErrorCode !== 'Ok') {
      const err = data?.ErrorDescription || data?.ErrorMessage || data.ErrorCode;
      console.error('OTAPI error:', data.ErrorCode, err);
      return new Response(
        JSON.stringify({ success: false, error: err }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Translate title, location, and attribute values
    const item = data?.Result?.Item;
    if (item) {
      const textsToTranslate: string[] = [];
      
      // Title
      textsToTranslate.push(item.Title || item.OriginalTitle || '');
      
      // Location
      const location = typeof item.Location === 'string' 
        ? item.Location 
        : (item.Location?.State || item.Location?.City || '');
      if (location) textsToTranslate.push(location);
      
      // Attribute values
      const attributes = Array.isArray(item.Attributes) ? item.Attributes : [];
      const attrTexts = attributes
        .filter((a: any) => !a?.IsConfigurator)
        .map((a: any) => `${a?.PropertyName || a?.OriginalPropertyName || ''}: ${a?.Value || a?.OriginalValue || ''}`);
      textsToTranslate.push(...attrTexts);

      // Configurator values for SKU names
      const configAttrs = attributes
        .filter((a: any) => a?.IsConfigurator)
        .map((a: any) => a?.Value || a?.OriginalValue || '')
        .filter(Boolean);
      textsToTranslate.push(...configAttrs);

      const translated = await batchTranslate(textsToTranslate);

      // Apply translated title
      if (translated[0]) item.Title = translated[0];

      // Apply translated location
      let idx = 1;
      if (location) {
        if (typeof item.Location === 'string') {
          item.Location = translated[idx];
        } else if (item.Location?.State) {
          item.Location.State = translated[idx];
        } else if (item.Location?.City) {
          item.Location.City = translated[idx];
        }
        idx++;
      }

      // Apply translated attributes
      for (let i = 0; i < attrTexts.length; i++) {
        const attr = attributes.filter((a: any) => !a?.IsConfigurator)[i];
        if (attr && translated[idx + i]) {
          const parts = translated[idx + i].split(':');
          if (parts.length >= 2) {
            attr.PropertyName = parts[0].trim();
            attr.Value = parts.slice(1).join(':').trim();
          }
        }
      }
      idx += attrTexts.length;

      // Apply translated configurator values
      const configAttrsList = attributes.filter((a: any) => a?.IsConfigurator);
      let configIdx = 0;
      for (const attr of configAttrsList) {
        const val = attr?.Value || attr?.OriginalValue || '';
        if (val && translated[idx + configIdx]) {
          attr.Value = translated[idx + configIdx];
        }
        configIdx++;
      }
    }

    console.log('Product details fetched and translated successfully');
    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error getting 1688 product:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to get product';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
