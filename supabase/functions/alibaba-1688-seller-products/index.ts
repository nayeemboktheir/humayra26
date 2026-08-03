const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const TMAPI_BASE = 'http://api.tmapi.top/1688';

function normalizeImg(u: string): string {
  if (!u) return '';
  if (u.startsWith('//')) return `https:${u}`;
  return u;
}

function mapItems(rawItems: any[]) {
  return rawItems.map((it: any) => {
    const numIid = parseInt(String(it?.item_id || it?.offer_id || it?.num_iid || '0'), 10) || 0;
    const price = parseFloat(String(it?.price_info?.sale_price || it?.price_info?.wholesale_price || it?.price_info?.drop_ship_price || it?.price || '0')) || 0;
    const sales = parseInt(String(it?.sale_info?.sale_quantity ?? it?.sale_info?.orders_count ?? it?.sales ?? '0'), 10) || undefined;
    return {
      num_iid: numIid,
      title: it?.title || it?.subject || '',
      pic_url: normalizeImg(it?.img || it?.pic_url || it?.image_url || ''),
      price,
      sales,
      detail_url: `/?product=${numIid}`,
      vendor_name: '',
    };
  }).filter((i: any) => i.num_iid > 0);
}

async function getJson(url: string) {
  try {
    const resp = await fetch(url, { headers: { Accept: 'application/json' } });
    const json = await resp.json();
    return { ok: resp.ok, json };
  } catch (e) {
    return { ok: false, json: { msg: e instanceof Error ? e.message : 'fetch failed' } };
  }
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

    const raw = String(vendorId).trim();
    const ps = Math.min(Math.max(pageSize, 1), 40);
    const tokenQ = encodeURIComponent(apiToken);

    // A "member id" is either numeric or already prefixed with b2b-.
    const isMemberId = /^b2b-/i.test(raw) || /^\d+$/.test(raw);
    const memberId = /^b2b-/i.test(raw) ? raw : `b2b-${raw}`;
    // Login-name shops (e.g. "lbhuang85") resolve to https://<login>.1688.com
    const shopUrl = `https://${raw}.1688.com`;

    let items: any[] = [];
    let totalCount = 0;
    let vendorInfo = { name: '', score: 0, location: '' };
    let lastError = '';

    const tryMemberId = async () => {
      const url = `${TMAPI_BASE}/shop/items?apiToken=${tokenQ}&member_id=${encodeURIComponent(memberId)}&page=${page}&page_size=${ps}&language=en`;
      const { json } = await getJson(url);
      if (json?.code === 200) {
        const d = json?.data || {};
        const mapped = mapItems(Array.isArray(d?.items) ? d.items : []);
        if (mapped.length > 0) {
          items = mapped;
          totalCount = d?.total_count || mapped.length;
          return true;
        }
      }
      lastError = json?.msg || lastError;
      return false;
    };

    const tryShopUrl = async () => {
      const url = `${TMAPI_BASE}/shop/items/v2?apiToken=${tokenQ}&shop_url=${encodeURIComponent(shopUrl)}&page=${page}&page_size=${ps}&language=en`;
      const { json } = await getJson(url);
      if (json?.code === 200) {
        const d = json?.data || {};
        const mapped = mapItems(Array.isArray(d?.items) ? d.items : (Array.isArray(d?.result) ? d.result : []));
        if (mapped.length > 0) {
          items = mapped;
          totalCount = d?.total_count || d?.total || mapped.length;
          return true;
        }
      }
      lastError = json?.msg || lastError;
      return false;
    };

    // Resolve a login-name shop into its member id via shop_info, then retry items.
    const tryResolveThenMemberId = async () => {
      const url = `${TMAPI_BASE}/shop/shop_info?apiToken=${tokenQ}&shop_url=${encodeURIComponent(shopUrl)}&language=en`;
      const { json } = await getJson(url);
      if (json?.code !== 200) { lastError = json?.msg || lastError; return false; }
      const d = json?.data || {};
      vendorInfo = {
        name: d?.shop_name || d?.company_name || '',
        score: parseFloat(String(d?.shop_score || d?.score || '0')) || 0,
        location: d?.address || d?.company_address || '',
      };
      const resolved = d?.member_id || d?.seller_member_id || d?.user_id || '';
      if (!resolved) return false;
      const mid = /^b2b-/i.test(String(resolved)) ? String(resolved) : `b2b-${resolved}`;
      const itemsUrl = `${TMAPI_BASE}/shop/items?apiToken=${tokenQ}&member_id=${encodeURIComponent(mid)}&page=${page}&page_size=${ps}&language=en`;
      const r = await getJson(itemsUrl);
      if (r.json?.code === 200) {
        const dd = r.json?.data || {};
        const mapped = mapItems(Array.isArray(dd?.items) ? dd.items : []);
        if (mapped.length > 0) {
          items = mapped;
          totalCount = dd?.total_count || mapped.length;
          return true;
        }
      }
      lastError = r.json?.msg || lastError;
      return false;
    };

    const order = isMemberId
      ? [tryMemberId, tryShopUrl, tryResolveThenMemberId]
      : [tryResolveThenMemberId, tryShopUrl, tryMemberId];

    for (const attempt of order) {
      if (await attempt()) break;
    }

    if (items.length === 0) {
      return new Response(JSON.stringify({ success: true, data: { items: [], total: 0, vendorInfo }, meta: { lastError } }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true, data: { items, total: totalCount, vendorInfo } }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
