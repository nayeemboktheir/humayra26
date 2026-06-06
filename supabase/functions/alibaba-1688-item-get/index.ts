const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TMAPI_BASE = 'http://api.tmapi.top/1688';

function normalizeImg(u: string): string {
  if (!u) return '';
  let cleaned = u.trim().replace(/\\/g, '').replace(/^['"]+|['"]+$/g, '');
  cleaned = cleaned.replace(/^https?:\/\/itemcdn\.tmall\.com\/%22(https?:\/\/[^%]+)%22\/?$/i, '$1');
  cleaned = cleaned.replace(/^https?:\/\/itemcdn\.tmall\.com\/["']?(https?:\/\/[^"']+?)["']?\/?$/i, '$1');
  cleaned = cleaned.replace(/&amp;/g, '&');
  if (cleaned.startsWith('//')) return `https:${cleaned}`;
  return cleaned;
}

function uniqueImgs(urls: string[]): string[] {
  const seen = new Set<string>();
  return urls.map(normalizeImg).filter((url) => {
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

async function fetchDetailImages(detailUrl?: string): Promise<string[]> {
  if (!detailUrl) return [];
  try {
    const resp = await fetch(normalizeImg(detailUrl), { headers: { Accept: 'text/html,*/*' } });
    if (!resp.ok) return [];
    const text = await resp.text();
    const decoded = text.replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/\\"/g, '"');
    const matches = [...decoded.matchAll(/https?:\/\/(?:cbu01|cbu02|cbu03|cbu04|img\.alicdn|gw\.alicdn)[^"'<>\s\\]+?\.(?:jpg|jpeg|png|webp)/gi)];
    return uniqueImgs(matches.map((m) => m[0]));
  } catch {
    return [];
  }
}

function parseNumber(value: any): number {
  const n = parseFloat(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function parseIntSafe(value: any): number {
  const n = parseInt(String(value ?? '').replace(/,/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function mapDetail(d: any, fallbackId: number, detailImgs: string[] = []) {
  const mainImgs: string[] = uniqueImgs(Array.isArray(d?.main_imgs) ? d.main_imgs : []);
  const descriptionImgs = detailImgs.length > 0 ? detailImgs : mainImgs;
  const props: any[] = Array.isArray(d?.product_props) ? d.product_props : [];

  function buildDescHtml(imgs: string[], productProps: any[]): string {
    const imgsHtml = imgs.map(u => `<p><img src="${u}" /></p>`).join('');
    const propsHtml = productProps.length
      ? `<table>${productProps.map(p => {
          const k = Object.keys(p)[0]; const v = p[k];
          return `<tr><td><b>${k}</b></td><td>${v}</td></tr>`;
        }).join('')}</table>`
      : '';
    return `${propsHtml}${imgsHtml}`;
  }

  const flatProps = props.map(p => {
    const k = Object.keys(p)[0]; return { name: k, value: String(p[k] ?? '') };
  });
  const price = parseNumber(d?.price_info?.price || d?.price_info?.price_min || d?.sku_price_range?.sku_param?.[0]?.price);
  const tiered = Array.isArray(d?.tiered_price_info?.prices) ? d.tiered_price_info.prices : (Array.isArray(d?.sku_price_range?.sku_param) ? d.sku_price_range.sku_param : []);
  const priceRange = tiered.length > 1
    ? tiered.map((t: any) => [parseIntSafe(t.beginAmount || '1') || 1, parseNumber(t.price)])
    : undefined;

  // Build variant image map from sku_props (color usually has imageUrl)
  const skuProps: any[] = Array.isArray(d?.sku_props) ? d.sku_props : [];
  const variantImageMap: Record<string, string> = {};
  skuProps.forEach((sp: any) => {
    const pid = String(sp?.pid ?? '');
    (Array.isArray(sp?.values) ? sp.values : []).forEach((v: any) => {
      const vid = String(v?.vid ?? '');
      const key = `${pid}:${vid}`;
      if (v?.imageUrl) variantImageMap[key] = normalizeImg(v.imageUrl);
    });
  });

  const rawSkus: any[] = Array.isArray(d?.skus) ? d.skus : [];
  const configuredItems = rawSkus.map((s: any) => {
    const propsIds = String(s?.props_ids || '').split(';').filter(Boolean);
    let imageUrl: string | undefined;
    for (const k of propsIds) { if (variantImageMap[k]) { imageUrl = variantImageMap[k]; break; } }
    return {
      id: String(s?.skuid || ''),
      title: String(s?.props_names || '').replace(/;/g, ' / '),
      imageUrl,
      price: parseFloat(String(s?.sale_price || price)) || price,
      stock: parseInt(String(s?.stock || '0'), 10) || 0,
    };
  });

  const totalStock = parseInt(String(d?.stock || '0'), 10) || configuredItems.reduce((s: number, c: any) => s + (c.stock || 0), 0);
  const minNum = parseInt(String(d?.tiered_price_info?.begin_num || d?.mixed_batch?.mix_begin || '1'), 10) || 1;
  const firstSkuWeight = rawSkus[0]?.package_info?.weight;
  const totalSold = parseInt(String(d?.sale_count || d?.sale_info?.sale_quantity_90days || '0'), 10) || undefined;
  const shop = d?.shop_info || {};

  return {
    num_iid: parseInt(String(d?.item_id || fallbackId), 10) || fallbackId,
    title: d?.title || '',
    desc: buildDescHtml(mainImgs, props),
    price,
    pic_url: mainImgs[0] || '',
    item_imgs: mainImgs.map(u => ({ url: u })),
    desc_img: mainImgs,
    location: d?.delivery_info?.location || '',
    num: String(totalStock || ''),
    min_num: minNum,
    video: d?.video_url || undefined,
    props: flatProps,
    priceRange,
    configuredItems: configuredItems.length > 0 ? configuredItems : undefined,
    seller_info: {
      nick: shop?.seller_login_id || shop?.shop_name || '',
      shop_name: shop?.shop_name || '',
      vendor_id: shop?.seller_member_id || shop?.seller_user_id || '',
      item_score: '',
      delivery_score: '',
      composite_score: '',
      rating: '',
      service_score: '',
      total_sales: totalSold,
    },
    total_sold: totalSold,
    item_weight: typeof firstSkuWeight === 'number' && firstSkuWeight > 0 ? firstSkuWeight : (d?.delivery_info?.unit_weight || undefined),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { numIid } = await req.json();
    if (!numIid) {
      return new Response(JSON.stringify({ success: false, error: 'Product ID (numIid) is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const apiToken = Deno.env.get('TMAPI_TOKEN');
    if (!apiToken) {
      return new Response(JSON.stringify({ success: false, error: 'TMAPI_TOKEN not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const cleanId = String(numIid).replace(/^abb-/, '');
    const url = `${TMAPI_BASE}/item_detail?apiToken=${encodeURIComponent(apiToken)}&item_id=${encodeURIComponent(cleanId)}&language=en`;
    const resp = await fetch(url, { headers: { Accept: 'application/json' } });
    const data = await resp.json();
    if (!resp.ok || (data?.code && data.code !== 200)) {
      const err = data?.msg || data?.message || `Request failed: ${resp.status}`;
      return new Response(JSON.stringify({ success: false, error: err }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const mapped = mapDetail(data?.data || {}, parseInt(cleanId, 10) || 0);
    return new Response(JSON.stringify({ success: true, data: mapped }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed to get product' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
