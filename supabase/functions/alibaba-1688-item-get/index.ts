import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { normalizeImg } from '../_shared/normalize-img.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TMAPI_BASE = 'https://api.tmapi.top/1688';
const CACHE_TTL_HOURS = 12;
const TMAPI_TIMEOUT_MS = 12000;
const DETAIL_PAGE_TIMEOUT_MS = 4000;

// Every upstream fetch is bounded — an unbounded one leaves the caller hanging until
// the client gives up, which is indistinguishable from the site being down.
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isNetworkFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const name = error instanceof Error ? error.name : '';
  if (name === 'AbortError' || name === 'TimeoutError') return true;
  return /dns error|failed to lookup|Name or service not known|Connect|network|fetch failed|aborted|timed out/i.test(message);
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (isNetworkFailure(error)) return 'TMAPI is temporarily unreachable. Please try again shortly.';
  return message.replace(/apiToken=[^&\s)]+/g, 'apiToken=REDACTED') || 'Failed to get product';
}

function uniqueImgs(urls: string[]): string[] {
  const seen = new Set<string>();
  return urls.map(normalizeImg).filter((url) => {
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

async function fetchShopProductCount(apiToken: string, memberId?: string): Promise<number> {
  if (!memberId) return 0;
  try {
    const resp = await fetchWithTimeout(
      `${TMAPI_BASE}/shop/items?apiToken=${encodeURIComponent(apiToken)}&member_id=${encodeURIComponent(memberId)}&page=1`,
      { headers: { Accept: 'application/json' } },
      DETAIL_PAGE_TIMEOUT_MS,
    );
    const j = await resp.json();
    return parseInt(String(j?.data?.total_count ?? 0), 10) || 0;
  } catch {
    return 0;
  }
}

async function fetchDetailImages(detailUrl?: string): Promise<string[]> {
  if (!detailUrl) return [];
  try {
    const resp = await fetchWithTimeout(
      normalizeImg(detailUrl),
      { headers: { Accept: 'text/html,*/*' } },
      DETAIL_PAGE_TIMEOUT_MS,
    );
    if (!resp.ok) return [];
    const text = await resp.text();
    const decoded = text.replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/\\"/g, '"');
    const matches = [...decoded.matchAll(/https?:\/\/(?:cbu01|cbu02|cbu03|cbu04|img\.alicdn|gw\.alicdn)[^"'<>\s\\]+?\.(?:jpg|jpeg|png|webp)/gi)];
    return uniqueImgs(matches.map((m) => m[0]));
  } catch {
    return [];
  }
}

// TMAPI's purpose-built description endpoint. Measured against the scrape above on three
// live products it returned an identical image set every time and was faster in each case
// (472ms vs 3117ms on the worst one). It is a billed call, though, and the scrape is free —
// so it is used only as a fallback for when scraping comes back empty, which is also the
// case where scraping has silently broken (1688 markup change, block, redirect).
async function fetchDescImagesViaApi(apiToken: string, itemId: string): Promise<string[]> {
  try {
    const resp = await fetchWithTimeout(
      `${TMAPI_BASE}/item_desc?apiToken=${encodeURIComponent(apiToken)}&item_id=${encodeURIComponent(itemId)}`,
      { headers: { Accept: 'application/json' } },
      DETAIL_PAGE_TIMEOUT_MS,
    );
    if (!resp.ok) return [];
    const json = await resp.json();
    if (json?.code !== 200) return [];
    return uniqueImgs(Array.isArray(json?.data?.detail_imgs) ? json.data.detail_imgs : []);
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

function mapDetail(d: any, fallbackId: number, detailImgs: string[] = [], shopProductCount = 0) {
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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Cache hit short-circuits both upstream fetches (TMAPI + the 1688 detail page).
    const cutoff = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();
    const { data: cached, error: cacheReadError } = await supabase
      .from('product_cache')
      .select('detail')
      .eq('item_id', cleanId)
      .gte('updated_at', cutoff)
      .maybeSingle();
    // A read failure here is non-fatal — the TMAPI path below still serves the request —
    // but silently discarding it meant an unapplied product_cache migration looked
    // identical to a cache miss, and every product view quietly paid full upstream cost.
    if (cacheReadError) {
      console.error('product_cache read failed (is the migration applied?):', cacheReadError.message);
    }
    if (cached?.detail) {
      return new Response(JSON.stringify({ success: true, data: cached.detail, cached: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const url = `${TMAPI_BASE}/item_detail?apiToken=${encodeURIComponent(apiToken)}&item_id=${encodeURIComponent(cleanId)}&language=en`;
    const resp = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, TMAPI_TIMEOUT_MS);
    const data = await resp.json();
    if (!resp.ok || (data?.code && data.code !== 200)) {
      const err = data?.msg || data?.message || `Request failed: ${resp.status}`;
      return new Response(JSON.stringify({ success: false, error: err }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const itemData = data?.data || {};
    const numericId = parseInt(cleanId, 10) || 0;
    const memberId = itemData?.shop_info?.seller_member_id || itemData?.shop_info?.member_id || '';
    const detailUrl = itemData?.detail_url;

    // Respond as soon as the core product data is in hand — description images fall back
    // to the main gallery (see mapDetail) and shop product count defaults to 0, neither of
    // which blocks a usable product page. fetchDetailImages (a full HTML-page scrape) and
    // fetchShopProductCount (a second TMAPI call) used to sit on the response path and cost
    // up to 4s each on a cache miss; they're now backfilled below, after responding, and
    // cached for the next viewer.
    const mapped = mapDetail(itemData, numericId, [], 0);

    // Persist after responding — neither the enrichment fetches nor the cache write may
    // sit on the response path.
    //
    // The cache is written TWICE, and the order matters. This runtime terminates isolates
    // shortly after the response is sent ("early termination has been triggered" in the
    // edge-runtime log), which killed the original single write: it sat behind up to 8s of
    // enrichment fetches and never ran, so every view of a product stayed a cache miss.
    // Writing the usable fast-path result first means a killed isolate still leaves a valid
    // cache entry; the enrichment pass then upgrades it if it gets the chance.
    const enrichAndCache = (async () => {
      const writeCache = async (detail: unknown, label: string) => {
        const { error } = await supabase
          .from('product_cache')
          .upsert({ item_id: cleanId, detail, updated_at: new Date().toISOString() }, { onConflict: 'item_id' });
        if (error) console.error(`product_cache ${label} write failed:`, error.message);
      };

      try {
        await writeCache(mapped, 'base');
      } catch (err) {
        console.error('product_cache base write threw:', err instanceof Error ? err.message : err);
        return;
      }

      try {
        let [detailImages, shopProductCount] = await Promise.all([
          fetchDetailImages(detailUrl),
          fetchShopProductCount(apiToken, memberId),
        ]);
        if (detailImages.length === 0) {
          detailImages = await fetchDescImagesViaApi(apiToken, cleanId);
        }
        // Nothing new to add — the base row already reflects this.
        if (detailImages.length === 0 && shopProductCount === 0) return;
        const enriched = mapDetail(itemData, numericId, detailImages, shopProductCount);
        await writeCache(enriched, 'enriched');
      } catch (err) {
        console.error('product_cache enrich threw:', err instanceof Error ? err.message : err);
      }
    })();
    const waitUntil = (globalThis as any).EdgeRuntime?.waitUntil;
    if (typeof waitUntil === 'function') {
      waitUntil.call((globalThis as any).EdgeRuntime, enrichAndCache);
    } else {
      // No EdgeRuntime.waitUntil in this runtime — background work isn't guaranteed to
      // survive after the response is sent, so fall back to blocking rather than silently
      // dropping the enrichment/cache write.
      await enrichAndCache;
    }

    return new Response(JSON.stringify({ success: true, data: mapped, cached: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    const retryable = isNetworkFailure(error);
    return new Response(JSON.stringify({
      success: false,
      error: safeErrorMessage(error),
      retryable,
    }),
      { status: retryable ? 200 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
