const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const TMAPI_BASE = 'http://api.tmapi.top/1688';

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
    const searchUrl = `${TMAPI_BASE}/global/search/keyword?apiToken=${encodeURIComponent(apiToken)}&keyword=${encodeURIComponent(keyword)}&language=en&page=${page}&page_size=${effectivePageSize}&sort=${sort}`;

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

    const items = rawItems.map((item: any) => ({
      num_iid: parseInt(String(item.offer_id || item.item_id || item.num_iid || '0'), 10) || 0,
      title: item.title || item.subject || '',
      pic_url: item.pic_url || item.image_url || item.img || '',
      price: parseFloat(String(item.price || item.original_price || '0')) || 0,
      promotion_price: item.promotion_price ? parseFloat(String(item.promotion_price)) : undefined,
      sales: parseInt(String(item.sales || item.monthly_sales || item.sold || '0'), 10) || undefined,
      detail_url: item.detail_url || item.product_url || `https://detail.1688.com/offer/${item.offer_id || item.item_id || item.num_iid}.html`,
      location: item.location || item.province || '',
      vendor_name: item.seller_nick || item.shop_name || item.supplier || '',
    }));

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
