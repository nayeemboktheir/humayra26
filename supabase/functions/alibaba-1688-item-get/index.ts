const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TMAPI_BASE = 'http://api.tmapi.top/1688';

function normalizeImg(u: string): string {
  if (!u) return '';
  if (u.startsWith('//')) return `https:${u}`;
  return u;
}

function buildDescHtml(mainImgs: string[], props: any[]): string {
  const imgsHtml = mainImgs.map(u => `<p><img src="${u}" /></p>`).join('');
  const propsHtml = props.length
    ? `<table>${props.map(p => {
        const k = Object.keys(p)[0]; const v = p[k];
        return `<tr><td><b>${k}</b></td><td>${v}</td></tr>`;
      }).join('')}</table>`
    : '';
  return `${propsHtml}${imgsHtml}`;
}

function mapDetail(d: any, fallbackId: number) {
  const mainImgs: string[] = (Array.isArray(d?.main_imgs) ? d.main_imgs : []).map(normalizeImg);
  const props: any[] = Array.isArray(d?.product_props) ? d.product_props : [];
  const flatProps = props.map(p => {
    const k = Object.keys(p)[0]; return { name: k, value: String(p[k] ?? '') };
  });
  const price = parseFloat(String(d?.price_info?.price || d?.price_info?.price_min || '0')) || 0;
  const tiered = Array.isArray(d?.tiered_price_info?.prices) ? d.tiered_price_info.prices : [];
  const priceRange = tiered.length > 1
    ? tiered.map((t: any) => [parseInt(String(t.beginAmount || '1'), 10) || 1, parseFloat(String(t.price || '0')) || 0])
    : undefined;

  // Build variant image map from sku_props (color usually has imageUrl)
  const skuProps: any[] = Array.isArray(d?.sku_props) ? d.sku_props : [];
  const variantImageMap: Record<string, string> = {};
  const variantNameMap: Record<string, string> = {};
  skuProps.forEach((sp: any) => {
    const pid = String(sp?.pid ?? '');
    (Array.isArray(sp?.values) ? sp.values : []).forEach((v: any) => {
      const vid = String(v?.vid ?? '');
      const key = `${pid}:${vid}`;
      if (v?.imageUrl) variantImageMap[key] = normalizeImg(v.imageUrl);
      variantNameMap[key] = v?.name || '';
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
      price: parseFloat(String(s?.sale_price || price