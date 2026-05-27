import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CACHE_TTL_HOURS = 12;
const TMAPI_BASE = 'http://api.tmapi.top/1688';

function mapTmapiItem(item: any) {
  const numIid = parseInt(String(item?.item_id || '0'), 10) || 0;
  const pics: string[] = [];
  if (item?.img) pics.push(String(item.img).startsWith('//') ? `https:${item.img}` : item.img);
  const sale = item?.sale_info?.sale_quantity_int ?? parseInt(String(item?.sale_info?.orders_count || '0'), 10) ?? 0;
  const areaFrom = Array.isArray(item?.delivery_info?.area_from) ? item.delivery_info.area_from.join(' ') : '';
  return {
    num_iid: numIid,
    title: item?.title || '',
    pic_url: pics[0] || '',
    price: parseFloat(String(item?.price_info?.sale_price || item?.price || '0')) || 0,
    sales: sale || undefined,
    detail_url: item?.product_url || `https://detail.1688.com/offer/${numIid}.html`,
    location: areaFrom,
    extra_images: pics,
    vendor_name: item?.shop_info?.company_name || item?.shop_info?.login_id || '',
    stock: undefined,
    weight: undefined,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { query, page = 1, pageSize = 20, imageUrl } = await req.json();
    if (!query && !imageUrl) {
      return new Response(JSON.stringify({ success: false, error: 'Search query or imageUrl is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const isImageSearch = !!imageUrl && !query;
    const effectivePageSize = Math.min(pageSize, 20);
    const queryKey = isImageSearch ? `img:${String(imageUrl).trim().toLowerCase()}` : String(query).trim().toLowerCase();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const cutoff = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();
    const { data: cached } = await supabase
      .from('search_cache')
      .select('items, total_results, updated_at')
      .eq('query_key', queryKey).eq('page', page).gte('updated_at', cutoff).maybeSingle();
    if (cached) {
      return new Response(JSON.stringify({ success: true, data: { items: cached.items, total: cached.total_results }, cached: true, translated: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const apiToken = Deno.env.get('TMAPI_TOKEN');
    if (!apiToken) {
      return new Response(JSON.stringify({ success: false, error: 'TMAPI_TOKEN not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (isImageSearch) {
      // Image search is handled by alibaba-1688-image-search edge function (TMAPI image_url).
      // This branch shouldn't normally be hit, but keep a safe empty response.
      return new Response(JSON.stringify({ success: true, data: { items: [], total: 0 } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const url = `${TMAPI_BASE}/search/items?apiToken=${encodeURIComponent(apiToken)}&keyword=${encodeURIComponent(query)}&page=${page}&page_size=${effectivePageSize}&sort=default`;
    console.log(`TMAPI search: "${query}" page=${page}`);

    const resp = await fetch(url, { headers: { Accept: 'application/json' } });
    const data = await resp.json();
    if (!resp.ok || (data?.code && data.code !== 200)) {
      return new Response(JSON.stringify({ success: false, error: data?.msg || data?.message || `Request failed: ${resp.status}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const result = data?.data || {};
    const rawItems: any[] = Array.isArray(result?.items) ? result.items : [];
    const totalCount = result?.total_count || rawItems.length;
    const items = rawItems.map(mapTmapiItem);

    // Batch translate Chinese titles to English via Lovable AI
    try {
      const lovableKey = Deno.env.get('LOVABLE_API_KEY');
      const chineseRe = /[\u4e00-\u9fff]/;
      const titles = items.map(i => i.title || '');
      const needsTranslation = titles.some(t => chineseRe.test(t));
      if (lovableKey && needsTranslation && titles.length > 0) {
        const joined = titles.join('\n---SEPARATOR---\n');
        const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${lovableKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash-lite',
            messages: [
              { role: 'system', content: 'Translate each input line from Chinese to natural English for e-commerce product titles. Inputs are separated by ---SEPARATOR---. Return ONLY translated lines in the same order, separated by ---SEPARATOR---. No numbering, no quotes. Keep brand names, model numbers, units as-is. If already English, return unchanged.' },
              { role: 'user', content: joined },
            ],
            max_tokens: 2000,
            temperature: 0.2,
          }),
        });
        if (aiResp.ok) {
          const aiData = await aiResp.json();
          const out = (aiData?.choices?.[0]?.message?.content || '').split('---SEPARATOR---').map((s: string) => s.trim());
          if (out.length === titles.length) {
            items.forEach((it, i) => { if (out[i]) it.title = out[i]; });
          }
        }
      }
    } catch (e) {
      console.log('Title translation skipped:', e instanceof Error ? e.message : String(e));
    }

    await supabase.from('search_cache').upsert(
      { query_key: queryKey, page, total_results: totalCount, items, translated: true },
      { onConflict: 'query_key,page' }
    );


    return new Response(JSON.stringify({ success: true, data: { items, total: totalCount }, cached: false, translated: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Search failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
