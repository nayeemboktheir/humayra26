// Ported from supabase/functions/alibaba-1688-cached-search/index.ts and
// supabase/functions/alibaba-1688-item-get/index.ts, so the JSON shape returned to the
// frontend is byte-for-byte compatible with what the Lovable-managed edge functions
// already return. Keep these two files in sync by hand if the upstream TMAPI mapping
// ever changes — there is no shared module between the Deno edge functions and this
// Node service.

const TMAPI_BASE = "http://api.tmapi.top/1688";

// Every upstream fetch is bounded — an unbounded one leaves the caller hanging until
// the browser gives up, which is indistinguishable from the site being down.
export async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function isNetworkFailure(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const name = error instanceof Error ? error.name : "";
  if (name === "AbortError" || name === "TimeoutError") return true;
  return /dns error|failed to lookup|Name or service not known|Connect|network|fetch failed|aborted|timed out|ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i.test(
    message,
  );
}

export function safeErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (isNetworkFailure(error)) return "TMAPI is temporarily unreachable. Please try again shortly.";
  return message.replace(/apiToken=[^&\s)]+/g, "apiToken=REDACTED") || "Request failed";
}

export function normalizeImg(u) {
  if (!u) return "";
  let cleaned = String(u).trim().replace(/\\/g, "").replace(/^['"]+|['"]+$/g, "");
  cleaned = cleaned.replace(/^https?:\/\/itemcdn\.tmall\.com\/%22(https?:\/\/[^%]+)%22\/?$/i, "$1");
  cleaned = cleaned.replace(/^https?:\/\/itemcdn\.tmall\.com\/["']?(https?:\/\/[^"']+?)["']?\/?$/i, "$1");
  cleaned = cleaned.replace(/&amp;/g, "&");
  if (cleaned.startsWith("//")) return `https:${cleaned}`;
  return cleaned;
}

function uniqueImgs(urls) {
  const seen = new Set();
  return urls.map(normalizeImg).filter((url) => {
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

function parseSold(v) {
  if (v == null || v === "") return null;
  const s = String(v).trim().toLowerCase().replace(/\+|,/g, "");
  const m = s.match(/^([\d.]+)\s*(k|w|万)?/);
  if (!m) return null;
  const n = parseFloat(m[1]) || 0;
  const u = m[2];
  if (u === "k") return Math.round(n * 1000);
  if (u === "w" || u === "万") return Math.round(n * 10000);
  return Math.round(n);
}

function parseNumber(value) {
  const n = parseFloat(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function parseIntSafe(value) {
  const n = parseInt(String(value ?? "").replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export function mapTmapiItem(item) {
  const numIid = parseInt(String(item?.item_id || "0"), 10) || 0;
  const pic = normalizeImg(item?.img || "");
  const sale = parseSold(
    item?.sale_info?.sale_quantity_int ??
      item?.sale_info?.sale_quantity_90days ??
      item?.sale_info?.orders_count,
  );
  const areaFrom = Array.isArray(item?.delivery_info?.area_from)
    ? item.delivery_info.area_from.join(" ")
    : item?.delivery_info?.location || "";
  const price =
    parseFloat(String(item?.price_info?.sale_price || item?.price_info?.price || item?.price || "0")) || 0;
  return {
    num_iid: numIid,
    title: item?.title || item?.title_origin || "",
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
      "",
    stock: undefined,
    weight: undefined,
  };
}

export async function fetchTmapiSearch({ apiToken, query, page, pageSize, timeoutMs }) {
  const effectivePageSize = Math.min(pageSize, 20);
  const url = `${TMAPI_BASE}/global/search/items?apiToken=${encodeURIComponent(apiToken)}&keyword=${encodeURIComponent(query)}&language=en&page=${page}&page_size=${effectivePageSize}&sort=default`;

  const resp = await fetchWithTimeout(url, { headers: { Accept: "application/json" } }, timeoutMs);
  const data = await resp.json();
  if (!resp.ok || (data?.code && data.code !== 200)) {
    const err = new Error(data?.msg || data?.message || `Request failed: ${resp.status}`);
    err.httpStatus = 400;
    throw err;
  }

  const result = data?.data || {};
  const rawItems = Array.isArray(result?.items) ? result.items : [];
  const totalCount = result?.total_count || (result?.has_next_page ? page * effectivePageSize + 1 : rawItems.length);
  const items = rawItems.map(mapTmapiItem);
  return { items, total: totalCount };
}

// ---------------------------------------------------------------------------
// Product detail
// ---------------------------------------------------------------------------

async function fetchShopProductCount(apiToken, memberId, timeoutMs) {
  if (!memberId) return 0;
  try {
    const resp = await fetchWithTimeout(
      `${TMAPI_BASE}/shop/items?apiToken=${encodeURIComponent(apiToken)}&member_id=${encodeURIComponent(memberId)}&page=1`,
      { headers: { Accept: "application/json" } },
      timeoutMs,
    );
    const j = await resp.json();
    return parseInt(String(j?.data?.total_count ?? 0), 10) || 0;
  } catch {
    return 0;
  }
}

async function fetchDetailImages(detailUrl, timeoutMs) {
  if (!detailUrl) return [];
  try {
    const resp = await fetchWithTimeout(
      normalizeImg(detailUrl),
      { headers: { Accept: "text/html,*/*" } },
      timeoutMs,
    );
    if (!resp.ok) return [];
    const text = await resp.text();
    const decoded = text.replace(/\\u002F/g, "/").replace(/\\\//g, "/").replace(/\\"/g, '"');
    const matches = [
      ...decoded.matchAll(/https?:\/\/(?:cbu01|cbu02|cbu03|cbu04|img\.alicdn|gw\.alicdn)[^"'<>\s\\]+?\.(?:jpg|jpeg|png|webp)/gi),
    ];
    return uniqueImgs(matches.map((m) => m[0]));
  } catch {
    return [];
  }
}

// Deliberately omits the OTAPI-style `Result.Item` mirror the Deno edge function still
// carries: that shape exists only for an old deployed frontend bundle to parse
// client-side, and this service's frontend (built from this same repo) reads the
// top-level fields directly — confirmed via `alibaba1688Api.getProduct()`, which never
// touches `data.Result`.
function mapDetail(d, fallbackId, detailImgs = [], shopProductCount = 0) {
  const mainImgs = uniqueImgs(Array.isArray(d?.main_imgs) ? d.main_imgs : []);
  const descriptionImgs = detailImgs.length > 0 ? detailImgs : mainImgs;
  const props = Array.isArray(d?.product_props) ? d.product_props : [];

  function buildDescHtml(imgs, productProps) {
    const imgsHtml = imgs.map((u) => `<p><img src="${u}" /></p>`).join("");
    const propsHtml = productProps.length
      ? `<table>${productProps
          .map((p) => {
            const k = Object.keys(p)[0];
            const v = p[k];
            return `<tr><td><b>${k}</b></td><td>${v}</td></tr>`;
          })
          .join("")}</table>`
      : "";
    return `${propsHtml}${imgsHtml}`;
  }

  const flatProps = props.map((p) => {
    const k = Object.keys(p)[0];
    return { name: k, value: String(p[k] ?? "") };
  });
  const price = parseNumber(d?.price_info?.price || d?.price_info?.price_min || d?.sku_price_range?.sku_param?.[0]?.price);
  const tiered = Array.isArray(d?.tiered_price_info?.prices)
    ? d.tiered_price_info.prices
    : Array.isArray(d?.sku_price_range?.sku_param)
      ? d.sku_price_range.sku_param
      : [];
  const priceRange =
    tiered.length > 1 ? tiered.map((t) => [parseIntSafe(t.beginAmount || "1") || 1, parseNumber(t.price)]) : undefined;

  const skuProps = Array.isArray(d?.sku_props) ? d.sku_props : [];
  const variantImageMap = {};
  skuProps.forEach((sp) => {
    const pid = String(sp?.pid ?? "");
    (Array.isArray(sp?.values) ? sp.values : []).forEach((v) => {
      const vid = String(v?.vid ?? "");
      const key = `${pid}:${vid}`;
      if (v?.imageUrl) variantImageMap[key] = normalizeImg(v.imageUrl);
    });
  });

  const rawSkus = Array.isArray(d?.skus) ? d.skus : [];
  const configuredItems = rawSkus.map((s) => {
    const propsIds = String(s?.props_ids || "").split(";").filter(Boolean);
    let imageUrl;
    for (const k of propsIds) {
      if (variantImageMap[k]) {
        imageUrl = variantImageMap[k];
        break;
      }
    }
    return {
      id: String(s?.skuid || ""),
      title: String(s?.props_names || "").replace(/;/g, " / "),
      imageUrl,
      price: parseNumber(s?.sale_price || price) || price,
      stock: parseIntSafe(s?.stock),
    };
  });

  const totalStock = parseIntSafe(d?.stock) || configuredItems.reduce((s, c) => s + (c.stock || 0), 0);
  const minNum = parseIntSafe(d?.tiered_price_info?.begin_num || d?.mixed_batch?.mix_begin || "1") || 1;
  const firstSkuWeight = rawSkus[0]?.package_info?.weight;
  const totalSold = parseInt(String(d?.sale_count || d?.sale_info?.sale_quantity_90days || "0"), 10) || undefined;
  const shop = d?.shop_info || {};
  const itemId = parseInt(String(d?.item_id || fallbackId), 10) || fallbackId;

  const sellerInfo = {
    nick: shop?.seller_login_id || shop?.shop_name || "",
    shop_name: shop?.shop_name || "",
    vendor_id: shop?.seller_member_id || shop?.member_id || shop?.seller_user_id || shop?.user_id || "",
    item_score: "",
    delivery_score: "",
    composite_score: "",
    rating: "",
    service_score: "",
    location: d?.delivery_info?.location || "",
    service_tags: Array.isArray(d?.service_tags) ? d.service_tags : [],
    product_count: shopProductCount,
    total_sales: totalSold,
  };

  return {
    num_iid: itemId,
    title: d?.title || "",
    desc: buildDescHtml(descriptionImgs, props),
    price,
    pic_url: mainImgs[0] || "",
    item_imgs: mainImgs.map((u) => ({ url: u })),
    desc_img: descriptionImgs,
    location: d?.delivery_info?.location || "",
    num: String(totalStock || ""),
    min_num: minNum,
    video: d?.video_url || undefined,
    props: flatProps,
    priceRange,
    configuredItems: configuredItems.length > 0 ? configuredItems : undefined,
    seller_info: sellerInfo,
    i_info: sellerInfo,
    total_sold: totalSold,
    item_weight: typeof firstSkuWeight === "number" && firstSkuWeight > 0 ? firstSkuWeight : d?.delivery_info?.unit_weight || undefined,
  };
}

export async function fetchTmapiProduct({ apiToken, numIid, tmapiTimeoutMs, detailPageTimeoutMs }) {
  const cleanId = String(numIid).replace(/^abb-/, "");
  const url = `${TMAPI_BASE}/item_detail?apiToken=${encodeURIComponent(apiToken)}&item_id=${encodeURIComponent(cleanId)}&language=en`;

  const resp = await fetchWithTimeout(url, { headers: { Accept: "application/json" } }, tmapiTimeoutMs);
  const data = await resp.json();
  if (!resp.ok || (data?.code && data.code !== 200)) {
    const err = new Error(data?.msg || data?.message || `Request failed: ${resp.status}`);
    err.httpStatus = 400;
    throw err;
  }

  const d = data?.data || {};
  const memberId = d?.shop_info?.seller_member_id || d?.shop_info?.member_id || "";
  const [detailImages, shopProductCount] = await Promise.all([
    fetchDetailImages(d?.detail_url, detailPageTimeoutMs),
    fetchShopProductCount(apiToken, memberId, detailPageTimeoutMs),
  ]);

  const mapped = mapDetail(d, parseInt(cleanId, 10) || 0, detailImages, shopProductCount);
  if (!mapped.num_iid) {
    throw new Error("Product not found");
  }
  return mapped;
}
