import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CACHE_TTL_HOURS = 12;
const TMAPI_BASE = 'http://api.tmapi.top/1688';
const TMAPI_TIMEOUT_MS = 15000;

// Without a timeout a stalled upstream connection hangs the caller until the browser
// gives up, which is indistinguishable from the site being down.
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function normalizeImg(u: string): string {
  if (!u) return '';
  if (u.startsWith('//')) return `https:${u}`;
  return u;
}

function parseSold(v: any): number | null {
  if (v == null || v === '') return null;
  const s = String(v).trim().toLowerCase().replace(/\+|,/g, '');
  const m = s.match(/^([\d.]+)\s*(k|w|万)?/);
  if (!m) return null;
  const n = parseFloat(m[1]) || 0;
  const u = m[2];
  if (u === 'k') return Math.round(n * 1000);
  if (u === 'w' || u === '万') return Math.round(n * 10000);
  return Math.round(n);
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

    const resp = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, TMAPI_TIMEOUT_MS);
    const data = await resp.json();
    if (!resp.ok || (data?.code && data.code !== 200)) {
      return new Response(JSON.stringify({ success: false, error: data?.msg || data?.message || `Request failed: ${resp.status}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const result = data?.data || {};
    const rawItems: any[] = Array.isArray(result?.items) ? result.items : [];
    const totalCount = result?.total_count || (result?.has_next_page ? (page * effectivePageSize + 1) : rawItems.length);
    const items = rawItems.map(mapTmapiItem);

    // Persist after responding. The upsert used to sit between the upstream result and
    // the reply, adding a full database round trip to every cache-miss search.
    const writeCache = supabase.from('search_cache').upsert(
      { query_key: queryKey, page, total_results: totalCount, items, translated: true },
      { onConflict: 'query_key,page' }
    ).then(
      ({ error }) => { if (error) console.error('search_cache write failed:', error.message); },
      (err) => { console.error('search_cache write threw:', err?.message ?? err); },
    );
    const waitUntil = (globalThis as any).EdgeRuntime?.waitUntil;
    if (typeof waitUntil === 'function') waitUntil.call((globalThis as any).EdgeRuntime, writeCache);
    else await writeCache;

    return new Response(JSON.stringify({ success: true, data: { items, total: totalCount }, cached: false, translated: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Search failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
