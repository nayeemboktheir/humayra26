import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CACHE_TTL_HOURS = 12;
const TMAPI_BASE = 'http://api.tmapi.top/1688';

function normalizeImg(u: string): string {
  if (!u) return '';
  if (u.startsWith('//')) return `https:${u}`;
  return u;
}

function mapTmapiItem(item: any) {
  const numIid = parseInt(String(item?.item_id || '0'), 10) || 0;
  const pic = normalizeImg(item?.img || '');
  const sale = parseSold(
    item?.sale_info?.sale_quantity_int ??
    item?.sale_info?.sale_quantity_90days ??
    item?.sale_info?.orders_count
  );
  const areaFrom = Array.isArray(item?.delivery_info?.area_from)
    ? item.delivery_info.area_from.join(' ')
    : (item?.delivery_info?.location || '');
  const price =
    parseFloat(String(item?.price_info?.sale_price || item?.price_info?.price || item?.price || '0')) || 0;
  return {
    num_iid: numIid,
    title: item?.title || item?.title_origin || '',
    pic_url: pic,
    price,
    sales: sale ?? undefined,
    detail_url: item?.product_url || `https://detail.1688.com/offer/${numIid}.html`,
    location: areaFrom,
    extra_images: pic ? [pic] : [],
    vendor_name:
      item?.shop_info?.company_name ||
      item?.shop_info?.shop_name ||
      item?.shop_info?.login_id ||
      item?.shop_info?.seller_login_id ||
      '',
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
      return new Response(JSON.stringify({ success: true, data: { items: [], total: 0 } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Multilingual cross-border search — TMAPI returns titles already translated to English.
    const url = `${TMAPI_BASE}/global/search/items?apiToken=${encodeURIComponent(apiToken)}&keyword=${encodeURIComponent(query)}&language=en&page=${page}&page_size=${effectivePageSize}&sort=default`;
    console.log(`TMAPI global search: "${query}" page=${page}`);

    const resp = await fetch(url, { headers: { Accept: 'application/json' } });
    const data = await resp.json();
    if (!resp.ok || (data?.code && data.code !== 200)) {
      return new Response(JSON.stringify({ success: false, error: data?.msg || data?.message || `Request failed: ${resp.status}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const result = data?.data || {};
    const rawItems: any[] = Array.isArray(result?.items) ? result.items : [];
    const totalCount = result?.total_count || (result?.has_next_page ? (page * effectivePageSize + 1) : rawItems.length);
    const items = rawItems.map(mapTmapiItem);

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
