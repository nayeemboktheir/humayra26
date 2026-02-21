const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // Translate non-English text fields using Lovable AI
    const item = data?.Result?.Item;
    if (item) {
      try {
        await translateItemFields(item);
      } catch (e) {
        console.error('Translation failed, returning as-is:', e);
      }
    }

    console.log('Product details fetched successfully');
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

// Check if text contains non-Latin characters (Chinese, Russian, etc.)
function needsTranslation(text: string): boolean {
  if (!text || text.length === 0) return false;
  // Match Chinese, Russian (Cyrillic), Japanese, Korean characters
  return /[\u0400-\u04FF\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(text);
}

async function translateItemFields(item: any) {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  if (!lovableKey) return;

  // Collect all translatable texts
  const textsToTranslate: string[] = [];
  const fieldMap: { path: string; index: number }[] = [];

  // Title
  if (needsTranslation(item.Title)) {
    fieldMap.push({ path: 'title', index: textsToTranslate.length });
    textsToTranslate.push(item.Title);
  }

  // Attributes
  const attributes = Array.isArray(item.Attributes) ? item.Attributes : [];
  attributes.forEach((attr: any, i: number) => {
    if (needsTranslation(attr.PropertyName)) {
      fieldMap.push({ path: `attr_name_${i}`, index: textsToTranslate.length });
      textsToTranslate.push(attr.PropertyName);
    }
    if (needsTranslation(attr.Value)) {
      fieldMap.push({ path: `attr_value_${i}`, index: textsToTranslate.length });
      textsToTranslate.push(attr.Value);
    }
  });

  // ConfiguredItems titles
  const configuredItems = Array.isArray(item.ConfiguredItems) ? item.ConfiguredItems : [];
  configuredItems.forEach((ci: any, i: number) => {
    if (needsTranslation(ci.Title)) {
      fieldMap.push({ path: `ci_title_${i}`, index: textsToTranslate.length });
      textsToTranslate.push(ci.Title);
    }
    // Configurator values
    const configurators = Array.isArray(ci.Configurators) ? ci.Configurators : [];
    configurators.forEach((c: any, j: number) => {
      if (needsTranslation(c.Value)) {
        fieldMap.push({ path: `ci_${i}_conf_${j}`, index: textsToTranslate.length });
        textsToTranslate.push(c.Value);
      }
    });
  });

  if (textsToTranslate.length === 0) return;

  console.log(`Translating ${textsToTranslate.length} fields to English...`);

  const joined = textsToTranslate.join('\n---SEP---\n');
  const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${lovableKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash-lite',
      messages: [
        {
          role: 'system',
          content: 'Translate to English. Input lines separated by ---SEP---. Return ONLY translations separated by ---SEP---. Keep brand names, numbers, sizes as-is. No extra text.'
        },
        { role: 'user', content: joined }
      ],
      max_tokens: 2000,
      temperature: 0.1,
    }),
  });

  if (!resp.ok) return;

  const aiData = await resp.json();
  const translatedText = aiData.choices?.[0]?.message?.content || '';
  const translations = translatedText.split('---SEP---').map((t: string) => t.trim());

  if (translations.length !== textsToTranslate.length) {
    console.log(`Translation count mismatch: got ${translations.length}, expected ${textsToTranslate.length}`);
    return;
  }

  // Apply translations back
  for (const fm of fieldMap) {
    const translated = translations[fm.index];
    if (!translated) continue;

    if (fm.path === 'title') {
      item.Title = translated;
    } else if (fm.path.startsWith('attr_name_')) {
      const idx = parseInt(fm.path.replace('attr_name_', ''));
      if (attributes[idx]) attributes[idx].PropertyName = translated;
    } else if (fm.path.startsWith('attr_value_')) {
      const idx = parseInt(fm.path.replace('attr_value_', ''));
      if (attributes[idx]) attributes[idx].Value = translated;
    } else if (fm.path.startsWith('ci_title_')) {
      const idx = parseInt(fm.path.replace('ci_title_', ''));
      if (configuredItems[idx]) configuredItems[idx].Title = translated;
    } else if (fm.path.match(/^ci_\d+_conf_\d+$/)) {
      const parts = fm.path.match(/^ci_(\d+)_conf_(\d+)$/);
      if (parts) {
        const ciIdx = parseInt(parts[1]);
        const confIdx = parseInt(parts[2]);
        if (configuredItems[ciIdx]?.Configurators?.[confIdx]) {
          configuredItems[ciIdx].Configurators[confIdx].Value = translated;
        }
      }
    }
  }

  console.log(`Translated ${translations.length} fields to English`);
}
