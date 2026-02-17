const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function translateTexts(texts: string[], apiKey: string): Promise<string[]> {
  if (texts.length === 0) return texts;
  // Filter out empty strings but keep track of indices
  const nonEmpty: { idx: number; text: string }[] = [];
  for (let i = 0; i < texts.length; i++) {
    if (texts[i]?.trim()) nonEmpty.push({ idx: i, text: texts[i] });
  }
  if (nonEmpty.length === 0) return texts;

  try {
    const joined = nonEmpty.map(n => n.text).join('\n---SEP---\n');
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
            content: `Translate all text from Russian/Chinese to natural English for e-commerce. Inputs are separated by ---SEP---. Return ONLY the translated texts separated by ---SEP---. No numbering, no quotes, no extra text. Keep brand names, model numbers, and units as-is. If already English, return unchanged.`
          },
          { role: 'user', content: joined }
        ],
        max_tokens: 4000,
        temperature: 0.2,
      }),
    });

    if (!response.ok) return texts;
    const data = await response.json();
    const translated = (data.choices?.[0]?.message?.content || '').split('---SEP---').map((t: string) => t.trim());
    if (translated.length !== nonEmpty.length) return texts;

    const result = [...texts];
    for (let i = 0; i < nonEmpty.length; i++) {
      if (translated[i]) result[nonEmpty[i].idx] = translated[i];
    }
    return result;
  } catch {
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

    // Translate all text fields to English
    const lovableKey = (Deno.env.get('LOVABLE_API_KEY') ?? '').trim();
    if (lovableKey) {
      try {
        const item = data?.Result?.Item;
        if (item) {
          // Collect all translatable texts
          const texts: string[] = [];
          const mapping: { path: string; index: number }[] = [];

          // Title
          if (item.Title) {
            mapping.push({ path: 'title', index: texts.length });
            texts.push(item.Title);
          }

          // Location
          const loc = item.Location;
          if (loc) {
            if (typeof loc === 'string') {
              mapping.push({ path: 'location_str', index: texts.length });
              texts.push(loc);
            } else {
              if (loc.State) {
                mapping.push({ path: 'location_state', index: texts.length });
                texts.push(loc.State);
              }
              if (loc.City) {
                mapping.push({ path: 'location_city', index: texts.length });
                texts.push(loc.City);
              }
            }
          }

          // Attributes (specs) - names and values
          const attrs = Array.isArray(item.Attributes) ? item.Attributes : [];
          for (let i = 0; i < attrs.length; i++) {
            const a = attrs[i];
            if (a?.PropertyName) {
              mapping.push({ path: `attr_name_${i}`, index: texts.length });
              texts.push(a.PropertyName);
            }
            if (a?.Value) {
              mapping.push({ path: `attr_value_${i}`, index: texts.length });
              texts.push(a.Value);
            }
          }

          // ConfiguredItems (variant names)
          const cItems = Array.isArray(item.ConfiguredItems) ? item.ConfiguredItems : [];
          for (let i = 0; i < cItems.length; i++) {
            const ci = cItems[i];
            if (ci?.Title) {
              mapping.push({ path: `ci_title_${i}`, index: texts.length });
              texts.push(ci.Title);
            }
            // Configurator values
            const configs = Array.isArray(ci?.Configurators) ? ci.Configurators : [];
            for (let j = 0; j < configs.length; j++) {
              if (configs[j]?.Value) {
                mapping.push({ path: `ci_cfg_${i}_${j}`, index: texts.length });
                texts.push(configs[j].Value);
              }
            }
          }

          // FeaturedValues
          const fvs = Array.isArray(item.FeaturedValues) ? item.FeaturedValues : [];
          for (let i = 0; i < fvs.length; i++) {
            if (fvs[i]?.Name) {
              mapping.push({ path: `fv_name_${i}`, index: texts.length });
              texts.push(fvs[i].Name);
            }
          }

          if (texts.length > 0) {
            const translated = await translateTexts(texts, lovableKey);

            // Apply translations back
            for (const m of mapping) {
              const val = translated[m.index];
              if (!val) continue;

              if (m.path === 'title') item.Title = val;
              else if (m.path === 'location_str') item.Location = val;
              else if (m.path === 'location_state') item.Location.State = val;
              else if (m.path === 'location_city') item.Location.City = val;
              else if (m.path.startsWith('attr_name_')) {
                const idx = parseInt(m.path.replace('attr_name_', ''));
                if (attrs[idx]) attrs[idx].PropertyName = val;
              }
              else if (m.path.startsWith('attr_value_')) {
                const idx = parseInt(m.path.replace('attr_value_', ''));
                if (attrs[idx]) attrs[idx].Value = val;
              }
              else if (m.path.startsWith('ci_title_')) {
                const idx = parseInt(m.path.replace('ci_title_', ''));
                if (cItems[idx]) cItems[idx].Title = val;
              }
              else if (m.path.startsWith('ci_cfg_')) {
                const parts = m.path.replace('ci_cfg_', '').split('_');
                const i = parseInt(parts[0]), j = parseInt(parts[1]);
                if (cItems[i]?.Configurators?.[j]) cItems[i].Configurators[j].Value = val;
              }
              else if (m.path.startsWith('fv_name_')) {
                const idx = parseInt(m.path.replace('fv_name_', ''));
                if (fvs[idx]) fvs[idx].Name = val;
              }
            }
          }
        }
      } catch (e) {
        console.error('Translation failed, returning original:', e);
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
