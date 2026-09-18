// The single TMAPI item_detail -> ProductDetail1688 mapping.
//
// It lives here rather than inside one function because more than one caller needs it:
// alibaba-1688-item-get builds a product from a live fetch, and refresh-product-prices
// re-derives the price-bearing fields from the same payload. CLAUDE.md records what
// happened the last time this mapping existed in two places — the copies drifted and
// production search shipped broken thumbnails — so there is deliberately one copy.
import { normalizeImg } from './normalize-img.ts';

export function uniqueImgs(urls: string[]): string[] {
  const seen = new Set<string>();
  return urls.map(normalizeImg).filter((url) => {
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

function parseNumber(value: any): number {
  const n = parseFloat(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function parseIntSafe(value: any): number {
  const n = parseInt(String(value ?? '').replace(/,/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

export function mapDetail(d: any, fallbackId: number, detailImgs: string[] = [], shopProductCount = 0) {
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
      price: parseNumber(s?.sale_price || price) || price,
      stock: parseIntSafe(s?.stock),
    };
  });

  const totalStock = parseIntSafe(d?.stock) || configuredItems.reduce((s: number, c: any) => s + (c.stock || 0), 0);
  const minNum = parseIntSafe(d?.tiered_price_info?.begin_num || d?.mixed_batch?.mix_begin || '1') || 1;
  const firstSkuWeight = rawSkus[0]?.package_info?.weight;
  const totalSold = parseInt(String(d?.sale_count || d?.sale_info?.sale_quantity_90days || '0'), 10) || undefined;
  const shop = d?.shop_info || {};
  const itemId = parseInt(String(d?.item_id || fallbackId), 10) || fallbackId;

  // The OTAPI-style `Result.Item` mirror that used to be built here is gone. It was
  // 19,423 of a 30,680-byte product response — 63% of every product-detail payload —
  // and nothing read it: the client's `getProduct()` consumes the flat fields below,
  // and `parseRawProduct`, the only `Result.Item` reader, was never called. Verified
  // against the live Hostinger bundle, where the sole `.Result` access sits inside
  // that dead method. cache-api/src/tmapiMap.js already omitted it.
  const sellerInfo = {
    nick: shop?.seller_login_id || shop?.shop_name || '',
    shop_name: shop?.shop_name || '',
    vendor_id: shop?.seller_member_id || shop?.member_id || shop?.seller_user_id || shop?.user_id || '',
    item_score: '',
    delivery_score: '',
    composite_score: '',
    rating: '',
    service_score: '',
    // TMAPI exposes no seller rating/service score, so surface the facts it does return.
    location: d?.delivery_info?.location || '',
    service_tags: Array.isArray(d?.service_tags) ? d.service_tags : [],
    product_count: shopProductCount,
    total_sales: totalSold,
  };

  return {
    num_iid: itemId,
    title: d?.title || '',
    desc: buildDescHtml(descriptionImgs, props),
    price,
    pic_url: mainImgs[0] || '',
    item_imgs: mainImgs.map(u => ({ url: u })),
    desc_img: descriptionImgs,
    location: d?.delivery_info?.location || '',
    num: String(totalStock || ''),
    min_num: minNum,
    video: d?.video_url || undefined,
    props: flatProps,
    priceRange,
    configuredItems: configuredItems.length > 0 ? configuredItems : undefined,
    seller_info: sellerInfo,
    i_info: sellerInfo,
    total_sold: totalSold,
    item_weight: typeof firstSkuWeight === 'number' && firstSkuWeight > 0 ? firstSkuWeight : (d?.delivery_info?.unit_weight || undefined),
  };
}
