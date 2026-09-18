import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { normalizeImg } from '../_shared/normalize-img.ts';
import { mapDetail, uniqueImgs } from '../_shared/map-detail.ts';
import { upsertCatalogDetail } from '../_shared/catalog.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TMAPI_BASE = 'https://api.tmapi.top/1688';
const CACHE_TTL_HOURS = 12;
// How long a catalogued price may be served before a live fetch is required. The rest of a
// product record is kept far longer — it is only the price that drifts.
const PRICE_MAX_AGE_DAYS = 7;
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

    // The catalog is consulted before product_cache. Both hold the same payload, but
    // product_cache expires after 12h, so a product opened yesterday paid the full upstream
    // cost again. The catalog keeps the record and ages the *price* separately: the parts
    // that are expensive to rebuild (description, specs, variant structure) are effectively
    // static, so only a price older than PRICE_MAX_AGE_DAYS forces a live fetch.
    const priceCutoff = new Date(Date.now() - PRICE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: catalogRow, error: catalogReadError } = await supabase
      .from('products')
      .select('detail, price_checked_at')
      .eq('item_id', cleanId)
      .not('detail', 'is', null)
      .gte('price_checked_at', priceCutoff)
      .maybeSingle();
    if (catalogReadError) {
      console.error('products read failed (is the migration applied?):', catalogReadError.message);
    }
    if (catalogRow?.detail) {
      // Counting opens is what lets a refresh pass prioritise the products people actually
      // look at. Deferred — it must not delay the response.
      const bumpViews = supabase.rpc('increment_product_views', { _item_id: cleanId }).then(
        ({ error }: any) => { if (error) console.error('view bump failed:', error.message); },
        (err: any) => { console.error('view bump threw:', err?.message ?? err); },
      );
      const wu = (globalThis as any).EdgeRuntime?.waitUntil;
      if (typeof wu === 'function') wu.call((globalThis as any).EdgeRuntime, bumpViews);

      return new Response(JSON.stringify({ success: true, data: catalogRow.detail, cached: true, source: 'catalog' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

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
      // product_cache is the 12h serving cache; products is the durable catalog. Both are
      // written from the same payload — the catalog is what will outlive the TTL, and it
      // records when the price was last verified so it can later be refreshed on its own.
      const writeCache = async (detail: unknown, label: string) => {
        const [{ error }] = await Promise.all([
          supabase
            .from('product_cache')
            .upsert({ item_id: cleanId, detail, updated_at: new Date().toISOString() }, { onConflict: 'item_id' }),
          upsertCatalogDetail(supabase, cleanId, detail),
        ]);
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
