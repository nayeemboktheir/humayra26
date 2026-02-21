import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CACHE_TTL_HOURS = 12; // Cache valid for 12 hours

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

    const queryKey = query.trim().toLowerCase();

    // Create Supabase client with service role for cache writes
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Step 1: Check cache
    const cutoff = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();
    const { data: cached } = await supabase
      .from('search_cache')
      .select('items, total_results, translated, updated_at')
      .eq('query_key', queryKey)
      .eq('page', page)
      .gte('updated_at', cutoff)
      .maybeSingle();

    if (cached && cached.translated) {
      console.log(`Cache HIT (translated) for "${queryKey}" page ${page}`);
      return new Response(
        JSON.stringify({
          success: true,
          data: { items: cached.items, total: cached.total_results },
          cached: true,
          translated: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If we have untranslated cache, return it but also trigger translation
    if (cached && !cached.translated) {
      console.log(`Cache HIT (untranslated) for "${queryKey}" page ${page}, triggering translation`);
      // Fire-and-forget translation update
      translateAndUpdateCache(supabase, queryKey, page, cached.items).catch(console.error);
      return new Response(
        JSON.stringify({
          success: true,
          data: { items: cached.items, total: cached.total_results },
          cached: true,
          translated: false,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Cache MISS — fetch from OTAPI
    console.log(`Cache MISS for "${queryKey}" page ${page}, fetching from OTAPI`);

    const apiKey = Deno.env.get('OTCOMMERCE_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: '1688 API not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const framePosition = (page - 1) * pageSize;
    const xmlParams = `<SearchItemsParameters><ItemTitle>${query}</ItemTitle><Provider>Alibaba1688</Provider></SearchItemsParameters>`;
    const url = `https://otapi.net/service-json/SearchItemsFrame?instanceKey=${encodeURIComponent(apiKey)}&language=en&xmlParameters=${encodeURIComponent(xmlParams)}&framePosition=${framePosition}&frameSize=${pageSize}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    const data = await response.json();

    if (!response.ok || (data?.ErrorCode && data.ErrorCode !== 'Ok' && data.ErrorCode !== 'None')) {
      const err = data?.ErrorMessage || data?.ErrorCode || `Request failed: ${response.status}`;
      console.error('OTAPI error:', err);
      return new Response(
        JSON.stringify({ success: false, error: err }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const rawItems = data?.Result?.Items?.Content || [];
    const totalCount = data?.Result?.Items?.TotalCount || 0;

    // Parse items into our format
    const items = rawItems.map((item: any) => {
      const price = item?.Price?.OriginalPrice || item?.Price?.ConvertedPriceList?.Internal?.Price || 0;
      const picUrl = item?.MainPictureUrl || item?.Pictures?.[0]?.Url || '';
      const externalId = item?.Id || '';
      const numIid = parseInt(externalId.replace(/^abb-/, ''), 10) || 0;
      const featuredValues = Array.isArray(item?.FeaturedValues) ? item.FeaturedValues : [];
      const totalSales = parseInt(featuredValues.find((v: any) => v?.Name === 'TotalSales')?.Value || '0', 10) || undefined;
      const pics = Array.isArray(item?.Pictures) ? item.Pictures : [];
      const location = item?.Location?.State || item?.Location?.City || '';

      return {
        num_iid: numIid,
        title: item?.Title || '',
        pic_url: picUrl,
        price: typeof price === 'number' ? price : parseFloat(price) || 0,
        sales: totalSales,
        detail_url: item?.ExternalItemUrl || `https://detail.1688.com/offer/${numIid}.html`,
        location,
        extra_images: pics.map((p: any) => p?.Url || p?.Large?.Url || '').filter(Boolean),
        vendor_name: item?.VendorName || item?.VendorDisplayName || '',
        stock: item?.MasterQuantity || undefined,
        weight: item?.PhysicalParameters?.Weight || undefined,
      };
    });

    console.log(`OTAPI returned ${items.length} items for "${queryKey}"`);

    // Step 3: Store raw items in cache (untranslated)
    await supabase.from('search_cache').upsert(
      {
        query_key: queryKey,
        page,
        total_results: totalCount,
        items,
        translated: false,
      },
      { onConflict: 'query_key,page' }
    );

    // Step 4: Fire-and-forget translation + cache update
    translateAndUpdateCache(supabase, queryKey, page, items).catch(console.error);

    // Return raw items immediately
    return new Response(
      JSON.stringify({
        success: true,
        data: { items, total: totalCount },
        cached: false,
        translated: false,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in cached search:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Search failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function translateAndUpdateCache(supabase: any, queryKey: string, page: number, items: any[]) {
  try {
    const titles = items.map((item: any) => item.title);
    if (titles.length === 0) return;

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) return;

    const textsToTranslate = titles.join('\n---SEPARATOR---\n');

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
            content: `You are a translator.\n\nTranslate the input text from Chinese to natural English for e-commerce.\n\nRules:\n- Each input is separated by ---SEPARATOR---\n- Return ONLY the translated texts, separated by ---SEPARATOR---\n- No numbering, no quotes, no bullets, no extra lines\n- Keep brand names, model numbers, units, and measurements as-is\n- If a line is already English, return it unchanged`
          },
          { role: 'user', content: textsToTranslate }
        ],
        max_tokens: 2000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) return;

    const data = await response.json();
    const translatedText = data.choices?.[0]?.message?.content || '';
    const translations = translatedText.split('---SEPARATOR---').map((t: string) => t.trim());

    if (translations.length !== titles.length) return;

    // Update items with translated titles
    const translatedItems = items.map((item: any, i: number) => ({
      ...item,
      title: translations[i] || item.title,
    }));

    // Update cache with translated items
    await supabase.from('search_cache').upsert(
      {
        query_key: queryKey,
        page,
        total_results: items.length > 0 ? (await supabase.from('search_cache').select('total_results').eq('query_key', queryKey).eq('page', page).maybeSingle()).data?.total_results || 0 : 0,
        items: translatedItems,
        translated: true,
      },
      { onConflict: 'query_key,page' }
    );

    console.log(`Cache updated with translations for "${queryKey}" page ${page}`);
  } catch (err) {
    console.error('Translation cache update failed:', err);
  }
}
