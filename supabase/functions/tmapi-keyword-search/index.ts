import { normalizeImg } from '../_shared/normalize-img.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const TMAPI_BASE = 'https://api.tmapi.top/1688';

// "1.2k" / "3万" style counts, as returned by sale_info.
function parseSold(v: any): number | undefined {
  if (v == null || v === '') return undefined;
  const s = String(v).trim().toLowerCase().replace(/\+|,/g, '');
  const m = s.match(/^([\d.]+)\s*(k|w|万)?/);
  if (!m) return undefined;
  const n = parseFloat(m[1]) || 0;
  if (m[2] === 'k') return Math.round(n * 1000);
  if (m[2] === 'w' || m[2] === '万') return Math.round(n * 10000);
  return Math.round(n) || undefined;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { keyword, page = 1, pageSize = 20, sort = 'default' } = await req.json();

    if (!keyword) {
      return new Response(JSON.stringify({ success: false, error: 'Keyword is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiToken = Deno.env.get('TMAPI_TOKEN');
    if (!apiToken) {
      return new Response(JSON.stringify({ success: false, error: 'TMAPI_TOKEN not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const effectivePageSize = Math.min(pageSize, 20);
    // `global/search/keyword` does not exist — it is absent from the TMAPI docs entirely,
    // where `keyword` is only ever a query parameter. The bogus path returned HTTP 200 with
    // an empty body, which this function then reported as `success: true, items: []`, so
    // every search here silently produced zero results. The real endpoint is the one
    // alibaba-1688-cached-search already uses.
    const searchUrl = `${TMAPI_BASE}/global/search/items?apiToken=${encodeURIComponent(apiToken)}&keyword=${encodeURIComponent(keyword)}&language=en&page=${page}&page_size=${effectivePageSize}&sort=${sort}`;

    console.log(`TMAPI keyword search: "${keyword}" page=${page}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    let resp: Response;
    try {
      resp = await fetch(searchUrl, { signal: controller.signal });
    } catch (fetchErr: any) {
      clearTimeout(timeout);
      const isTimeout = fetchErr?.name === 'AbortError';
      return new Response(JSON.stringify({
        success: false,
        error: isTimeout ? 'Search timed out' : `Request failed: ${fetchErr?.message}`,
      }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    clearTimeout(timeout);

    const rawText = await resp.text();
    if (!rawText || rawText.length < 2) {
      return new Response(JSON.stringify({
        success: true, data: { items: [], total: 0 },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let searchData: any;
    try { searchData = JSON.parse(rawText); } catch {
      return new Response(JSON.stringify({
        success: true, data: { items: [], total: 0 },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (searchData?.code && searchData.code !== 200) {
      return new Response(JSON.stringify({
        success: false, error: searchData?.msg || `TMAPI error: ${searchData.code}`,
      }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const resultData = searchData?.data || searchData;
    const rawItems = resultData?.items || resultData?.result || [];
    const total = resultData?.total || resultData?.total_count || rawItems.length;

    // Field paths follow what global/search/items actually returns — the previous mapping
    // read `item.price`, `item.sales` and `item.shop_name`, none of which exist on this
    // endpoint, so even a successful response would have produced price: 0 on every row.
    const items = rawItems.map((item: any) => {
      const numIid = parseInt(String(item?.item_id || item?.offer_id || item?.num_iid || '0'), 10) || 0;
      const pic = normalizeImg(item?.img || item?.pic_url || item?.image_url || '');
      return {
        num_iid: numIid,
        title: item?.title || item?.title_origin || item?.subject || '',
        pic_url: pic,
        price: parseFloat(String(
          item?.price_info?.sale_price || item?.price_info?.price || item?.price || '0'
        )) || 0,
        promotion_price: item?.price_info?.discount_price
          ? parseFloat(String(item.price_info.discount_price))
          : undefined,
        sales: parseSold(
          item?.sale_info?.sale_quantity_int ??
          item?.sale_info?.sale_quantity_90days ??
          item?.sale_info?.orders_count
        ),
        detail_url: item?.product_url || item?.detail_url || `https://detail.1688.com/offer/${numIid}.html`,
        location: Array.isArray(item?.delivery_info?.area_from)
          ? item.delivery_info.area_from.join(' ')
          : (item?.delivery_info?.location || ''),
        extra_images: pic ? [pic] : [],
        vendor_name:
          item?.shop_info?.company_name ||
          item?.shop_info?.shop_name ||
          item?.shop_info?.login_id ||
          item?.shop_info?.seller_login_id ||
          '',
      };
    }).filter((i: any) => i.num_iid > 0);

    console.log(`TMAPI keyword search: ${items.length} items, total: ${total}`);

    return new Response(JSON.stringify({
      success: true,
      data: { items, total },
      meta: { method: 'tmapi_keyword', page, pageSize: effectivePageSize, keyword },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error in keyword search:', error);
    return new Response(JSON.stringify({
      success: false, error: error instanceof Error ? error.message : 'Search failed',
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
