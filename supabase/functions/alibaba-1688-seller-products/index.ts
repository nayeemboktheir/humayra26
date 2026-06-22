const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function normalizeImg(u: string): string {
  if (!u) return '';
  if (u.startsWith('//')) return `https:${u}`;
  return u;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { vendorId, page = 1, pageSize = 40 } = await req.json();
    if (!vendorId) {
      return new Response(JSON.stringify({ success: false, error: 'vendorId is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const apiToken = Deno.env.get('TMAPI_TOKEN');
    if (!apiToken) {
      return new Response(JSON.stringify({ success: false, error: 'API not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    // TMAPI requires member_id with `b2b-` prefix
    const memberId = vendorId.startsWith('b2b-') ? vendorId : `b2b-${vendorId}`;
    const ps = Math.min(Math.max(pageSize, 1), 40);
    const url = `http://api.tmapi.top/1688/shop/items?apiToken=${encodeURIComponent(apiToken)}&member_id=${encodeURIComponent(memberId)}&page=${page}&page_size=${ps}&language=en`;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    const json = await response.json();
    if (!response.ok || json?.code !== 200) {
      return new Response(JSON.stringify({ success: false, error: json?.msg || `Request failed: ${response.status}` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const data = json?.data || {};
    const rawItems: any[] = Array.isArray(data?.items) ? data.items : [];
    const items = rawItems.map((it: any) => {
      const numIid = parseInt(String(it?.item_id || '0'), 10) || 0;
      const price = parseFloat(String(it?.price_info?.sale_price || it?.price_info?.wholesale_price || it?.price_info?.drop_ship_price || it?.price || '0')) || 0;
      const sales = parseInt(String(it?.sale_info?.sale_quantity ?? it?.sale_info?.orders_count ?? '0'), 10) || undefined;
      return {
        num_iid: numIid,
        title: it?.title || '',
        pic_url: normalizeImg(it?.img || ''),
        price,
        sales,
        detail_url: `/?product=${numIid}`,
        vendor_name: '',
      };
    });
    const totalCount = data?.total_count || items.length;
    // Try to enrich vendor info from first item; TMAPI shop/items doesn't include shop_info, leave name/location null.
    const vendorInfo = { name: '', score: 0, location: '' };
    return new Response(JSON.stringify({ success: true, data: { items, total: totalCount, vendorInfo } }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
