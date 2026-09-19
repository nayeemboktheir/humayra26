import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { normalizeImg } from '../_shared/normalize-img.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const TMAPI_BASE = 'https://api.tmapi.top/1688';

type SaveCache = (url: string, page: number, items: any[], total: number) => Promise<void>;

function parseSold(v: any): number | undefined {
  if (v == null || v === '') return undefined;
  const s = String(v).trim().toLowerCase().replace(/\+|,/g, '');
  const m = s.match(/^([\d.]+)\s*(k|w|万)?/);
  if (!m) return undefined;
  const n = parseFloat(m[1]) || 0;
  const u = m[2];
  if (u === 'k') return Math.round(n * 1000);
  if (u === 'w' || u === '万') return Math.round(n * 10000);
  return Math.round(n) || undefined;
}

function mapTmapiImageItem(item: any) {
  const numIid = parseInt(String(item?.offer_id || item?.item_id || item?.num_iid || '0'), 10) || 0;
  const picUrl = normalizeImg(item?.pic_url || item?.image_url || item?.img || '');
  const price = parseFloat(String(
    item?.price_info?.sale_price ||
    item?.price_info?.price ||
    item?.price ||
    item?.original_price ||
    '0'
  )) || 0;
  const areaFrom = Array.isArray(item?.delivery_info?.area_from)
    ? item.delivery_info.area_from.join(' ')
    : (item?.delivery_info?.location || item?.location || item?.province || '');

  return {
    num_iid: numIid,
    title: item?.title || item?.subject || item?.title_origin || '',
    pic_url: picUrl,
    price,
    promotion_price: item?.promotion_price ? parseFloat(String(item.promotion_price)) : undefined,
    sales: parseSold(item?.sales ?? item?.monthly_sales ?? item?.sold ?? item?.sale_info?.sale_quantity_int ?? item?.sale_info?.sale_quantity_90days),
    detail_url: item?.detail_url || item?.product_url || `https://detail.1688.com/offer/${numIid}.html`,
    location: areaFrom,
    vendor_name: item?.seller_nick || item?.shop_name || item?.supplier || item?.shop_info?.company_name || item?.shop_info?.shop_name || item?.shop_info?.login_id || '',
    extra_images: picUrl ? [picUrl] : [],
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, imageUrl, originalImageUrl, page = 1, pageSize = 20 } = await req.json();

    if (!imageBase64 && !imageUrl) {
      return new Response(JSON.stringify({ success: false, error: 'Image is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiToken = Deno.env.get('TMAPI_TOKEN');
    if (!apiToken) {
      return new Response(JSON.stringify({ success: false, error: 'TMAPI_TOKEN not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const startTime = Date.now();
    const effectivePageSize = Math.min(pageSize, 20);

    // Serve from cache when possible (saves TMAPI credits on repeat/paging)
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const cacheKeyFor = (u: string) => `img2:${String(u).trim().toLowerCase()}`;
    if (imageUrl) {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: cached } = await supabase
        .from('search_cache')
        .select('items, total_results')
        .eq('query_key', cacheKeyFor(imageUrl)).eq('page', page).gte('updated_at', cutoff).maybeSingle();
      if (cached?.items) {
        return new Response(JSON.stringify({
          success: true, data: { items: cached.items, total: cached.total_results },
          meta: { method: 'tmapi_image_cache', page, pageSize: effectivePageSize, convertedImageUrl: imageUrl, originalImageUrl: originalImageUrl || imageUrl },
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }
    const saveCache = async (u: string, p: number, items: any[], total: number) => {
      if (!u || !items?.length) return;
      try {
        await supabase.from('search_cache').upsert(
          { query_key: cacheKeyFor(u), page: p, total_results: total, items, translated: true },
          { onConflict: 'query_key,page' });
      } catch { /* cache write is best-effort */ }
    };
    let imgUrl = imageUrl || '';
    let originalUrl = originalImageUrl || imgUrl;

    // PATH 1: Already an alicdn URL → search directly (fast path for pagination)
    const isAlicdn = imgUrl && (imgUrl.includes('alicdn.com') || imgUrl.includes('aliyuncs.com'));
    if (isAlicdn) {
      console.log(`Direct TMAPI search: alicdn URL, page ${page}`);
      return await doImageSearch(imgUrl, page, effectivePageSize, apiToken, startTime, imgUrl, imgUrl, saveCache);
    }

    // PATH 2: Already a converted path (starts with /) → use V2 endpoint directly
    if (imgUrl && imgUrl.startsWith('/')) {
      console.log(`V2 search with converted path, page ${page}`);
      return await doImageSearchV2(imgUrl, page, effectivePageSize, apiToken, startTime, imgUrl, originalUrl, saveCache);
    }

    // PATH 3: User-uploaded image → convert first, then search with V2.
    //
    // convert_url is by far the most expensive step here (measured 1.7-13.3s; it ingests the
    // image into Alibaba's visual-search index rather than rewriting a URL, so the cost is
    // their indexing queue and does not shrink with the payload). Its output is durable and
    // reusable though — tokens minted over an hour earlier still return results — so the
    // same image searched twice should only ever pay for ingestion once.
    //
    // A cache hit skips the upload as well as the conversion: the only reason to put the
    // image in storage is to give TMAPI a URL to ingest from, and that has already happened.
    let cacheKeyHash: string | null = null;
    if (imageBase64 && !imgUrl) {
      cacheKeyHash = await sha256Hex(imageBase64);
      const cachedToken = await getCachedConvertToken(supabase, cacheKeyHash);
      if (cachedToken) {
        console.log(`convert cache hit (${cacheKeyHash.slice(0, 12)}) — skipping upload and convert`);
        const hit = await doImageSearchV2(cachedToken, page, effectivePageSize, apiToken, startTime, cachedToken, originalUrl || cachedToken, saveCache);
        // A token can outlive its usefulness upstream. doImageSearchV2 answers with an empty
        // result rather than throwing, so treat "nothing found" as a stale token and fall
        // through to a full re-ingest instead of handing back an empty page.
        const body = await hit.clone().json().catch(() => null);
        if (body?.data?.items?.length) return hit;
        console.log('cached token returned nothing — re-converting');
      }
    }

    if (imageBase64 && !imgUrl) {
      console.log('Uploading base64...');
      imgUrl = await uploadToTempBucket(imageBase64);
      originalUrl = imgUrl;
      console.log('Upload:', Date.now() - startTime, 'ms');
    }

    // Step A: Convert user image URL to TMAPI-recognized path
    console.log('Converting image URL for TMAPI...');
    const convertedPath = await convertImageUrl(imgUrl, apiToken);
    console.log('Convert result:', convertedPath?.slice(0, 100), 'in', Date.now() - startTime, 'ms');

    if (convertedPath && convertedPath !== imgUrl) {
      if (cacheKeyHash) putCachedConvertToken(supabase, cacheKeyHash, convertedPath);
      // Use V2 endpoint with the converted path
      return await doImageSearchV2(convertedPath, page, effectivePageSize, apiToken, startTime, convertedPath, originalUrl, saveCache);
    }

    return emptyResponse(imgUrl, originalUrl || imgUrl);

  } catch (error) {
    console.error('Error in image search:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to search by image',
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

// Search with standard endpoints (for alicdn URLs)
async function doImageSearch(
  imgUrl: string, page: number, pageSize: number,
  apiToken: string, startTime: number, convertedUrl: string, originalUrl: string = '',
  saveCache?: SaveCache,
): Promise<Response> {
  const endpoints = [
    `${TMAPI_BASE}/search/image?apiToken=${encodeURIComponent(apiToken)}&img_url=${encodeURIComponent(imgUrl)}&page=${page}&page_size=${pageSize}&sort=default`,
    `${TMAPI_BASE}/global/search/image?apiToken=${encodeURIComponent(apiToken)}&img_url=${encodeURIComponent(imgUrl)}&language=en&page=${page}&page_size=${pageSize}&sort=default`,
  ];

  for (const searchUrl of endpoints) {
    const epName = searchUrl.includes('/global/') ? 'global' : 'standard';
    const result = await fetchAndParse(searchUrl, epName, pageSize, apiToken, startTime, convertedUrl, originalUrl, page, saveCache);
    if (result) return result;
  }

  return emptyResponse(convertedUrl, originalUrl);
}

// Search with V2 endpoint (for converted image paths from convert_url)
async function doImageSearchV2(
  imgPath: string, page: number, pageSize: number,
  apiToken: string, startTime: number, convertedUrl: string, originalUrl: string = '',
  saveCache?: SaveCache,
): Promise<Response> {
  const searchUrl = `${TMAPI_BASE}/global/search/image/v2?apiToken=${encodeURIComponent(apiToken)}&img_url=${encodeURIComponent(imgPath)}&language=en&page=${page}&page_size=${pageSize}&sort=default`;

  const result = await fetchAndParse(searchUrl, 'v2', pageSize, apiToken, startTime, convertedUrl, originalUrl, page, saveCache);
  if (result) return result;

  // V2 failed — retry the other image endpoints with the SAME token.
  //
  // This used to prepend https://cbu01.alicdn.com to the path first, on the assumption that
  // the converted value is a hosted image. It is not: convert_url ingests the image into
  // Alibaba's visual-search index and returns an internal reference, which 404s on every
  // alicdn host. The constructed URL therefore pointed at nothing and the retry returned
  // `code: 200, items: 0` every single time — a fallback that could never fire.
  //
  // The token itself is accepted by all three image endpoints regardless of which one
  // `search_api_endpoint` named when it was minted (verified: a /global/search/image/v2
  // token returns 20 items on v2, 40 on /global/search/image and 20 on /search/image), so
  // it is passed through unchanged.
  if (imgPath.startsWith('/')) {
    console.log('V2 failed, retrying other image endpoints with the same converted token...');
    return await doImageSearch(imgPath, page, pageSize, apiToken, startTime, convertedUrl, originalUrl, saveCache);
  }

  return emptyResponse(convertedUrl, originalUrl);
}

// Shared fetch + parse logic
async function fetchAndParse(
  searchUrl: string, epName: string, pageSize: number,
  apiToken: string, startTime: number, convertedUrl: string, originalUrl: string, page: number,
  saveCache?: SaveCache,
): Promise<Response | null> {
  console.log(`Trying ${epName} endpoint, page ${page}...`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  let resp: Response;
  try {
    resp = await fetch(searchUrl, { signal: controller.signal });
  } catch (fetchErr: any) {
    clearTimeout(timeout);
    console.log(`${epName} fetch error:`, fetchErr?.message);
    return null;
  }
  clearTimeout(timeout);

  const rawText = await resp.text();
  console.log(`${epName} raw (${rawText.length} chars):`, rawText.slice(0, 300));

  if (!rawText || rawText.length < 2) return null;

  let searchData: any;
  try { searchData = JSON.parse(rawText); } catch { return null; }

  if (searchData?.code && searchData.code !== 200) {
    console.log(`${epName} api_code: ${searchData.code} msg: ${searchData.msg || ''}`);
    return null;
  }

  const resultData = searchData?.data || searchData;
  const rawItems = resultData?.items || resultData?.result || [];
  const total = resultData?.total || resultData?.total_count || rawItems.length;

  if (rawItems.length === 0) {
    console.log(`${epName} returned 0 items`);
    return null;
  }

  const items = rawItems.map(mapTmapiImageItem).filter((item: any) => item.num_iid && item.pic_url);

  console.log(`${epName}: ${items.length} items in ${Date.now() - startTime}ms`);
  if (saveCache) await saveCache(convertedUrl, page, items, total);
  return new Response(JSON.stringify({
    success: true,
    data: { items, total },
    meta: { method: 'tmapi_image', page, pageSize, convertedImageUrl: convertedUrl, originalImageUrl: originalUrl || convertedUrl },
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

/** Content hash of the uploaded image, so the same photo maps to the same cached token. */
async function sha256Hex(base64: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(base64));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Tokens were verified still valid over an hour after minting, but there is no documented
// lifetime, so this is deliberately short of anything assumed. A stale token costs one
// wasted search and is then re-minted.
const CONVERT_TOKEN_TTL_HOURS = 12;

async function getCachedConvertToken(supabase: any, hash: string): Promise<string | null> {
  try {
    const cutoff = new Date(Date.now() - CONVERT_TOKEN_TTL_HOURS * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('search_cache')
      .select('items')
      .eq('query_key', `imgtok:${hash}`)
      .eq('page', 1)
      .gte('updated_at', cutoff)
      .maybeSingle();
    const token = data?.items?.token;
    return typeof token === 'string' && token ? token : null;
  } catch (err) {
    console.error('convert token read failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** Fire-and-forget: failing to remember a token must not fail the search that produced it. */
function putCachedConvertToken(supabase: any, hash: string, token: string) {
  const write = supabase
    .from('search_cache')
    .upsert({ query_key: `imgtok:${hash}`, page: 1, total_results: 0, items: { token }, translated: true }, { onConflict: 'query_key,page' })
    .then(
      ({ error }: any) => { if (error) console.error('convert token write failed:', error.message); },
      (err: any) => { console.error('convert token write threw:', err?.message ?? err); },
    );
  const waitUntil = (globalThis as any).EdgeRuntime?.waitUntil;
  if (typeof waitUntil === 'function') waitUntil.call((globalThis as any).EdgeRuntime, write);
}

function emptyResponse(convertedUrl: string, originalUrl: string): Response {
  return new Response(JSON.stringify({
    success: true, data: { items: [], total: 0 },
    meta: { method: 'tmapi_image', convertedImageUrl: convertedUrl, originalImageUrl: originalUrl || convertedUrl },
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// Convert URL via TMAPI — returns image path for V2 endpoint.
//
// Returning `imgUrl` unchanged is how this signals failure, and the caller turns that into
// an empty result set — which the customer cannot tell apart from "nothing matched your
// photo". Measured over six first-time searches, one conversion failed outright, so roughly
// one upload in six was silently answering "no results" for a perfectly good image.
// Failures are transient (the same image converted fine on a second attempt), hence the
// retry, and they are now logged with the upstream code rather than swallowed.
const CONVERT_TIMEOUT_MS = 20000;
const CONVERT_ATTEMPTS = 2;

async function convertImageUrl(imgUrl: string, apiToken: string): Promise<string> {
  for (let attempt = 1; attempt <= CONVERT_ATTEMPTS; attempt++) {
    // Successful conversions have been observed taking up to ~18s, so the bound is generous;
    // it exists to stop a stalled connection consuming the whole invocation.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONVERT_TIMEOUT_MS);
    try {
      const convertResp = await fetch(
        `${TMAPI_BASE}/tools/image/convert_url?apiToken=${encodeURIComponent(apiToken)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: imgUrl, search_api_endpoint: '/global/search/image/v2' }),
          signal: controller.signal,
        }
      );
      const rawText = await convertResp.text();
      if (rawText && rawText.length >= 2) {
        let convertData: any = null;
        try { convertData = JSON.parse(rawText); } catch { /* handled below */ }
        if (convertData?.code === 200 && convertData?.data) {
          const d = convertData.data;
          const result = d.image_url || d.img_url || d.url || (typeof d === 'string' ? d : '') || '';
          if (result) return result;
        }
        console.error(`convert_url attempt ${attempt}/${CONVERT_ATTEMPTS} rejected: code=${convertData?.code} msg=${String(convertData?.msg ?? '').slice(0, 120)}`);
      } else {
        console.error(`convert_url attempt ${attempt}/${CONVERT_ATTEMPTS} returned an empty body`);
      }
    } catch (e) {
      console.error(`convert_url attempt ${attempt}/${CONVERT_ATTEMPTS} threw:`, e instanceof Error ? e.message : e);
    } finally {
      clearTimeout(timer);
    }
    if (attempt < CONVERT_ATTEMPTS) await new Promise((r) => setTimeout(r, 400));
  }
  console.error('convert_url failed after all attempts — image search will return no results');
  return imgUrl;
}

// Upload base64 image to temp bucket
async function uploadToTempBucket(imageBase64: string): Promise<string> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const b = imageBase64.slice(0, 20);
  const ext = b.startsWith('/9j/') ? 'jpg' : b.startsWith('iVBOR') ? 'png' : 'jpg';
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
  const binaryStr = atob(imageBase64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

  const fileName = `search-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from('temp-images')
    .upload(fileName, bytes, { contentType: mime, upsert: true });

  if (error) throw new Error(`Image upload failed: ${error.message}`);
  const { data: pub } = supabase.storage.from('temp-images').getPublicUrl(fileName);

  // getPublicUrl derives the origin from SUPABASE_URL, which inside the container is the
  // internal gateway (http://supabase-kong:8000). TMAPI fetches this URL from the public
  // internet in order to convert the image, so an internal hostname simply fails to
  // resolve — the convert step then returns the input unchanged and the search falls
  // through to an empty result. That is why uploaded-image search returned nothing while
  // searching by an existing alicdn URL worked: only this path goes through storage.
  const externalBase = (Deno.env.get('SUPABASE_PUBLIC_URL') || '').replace(/\/+$/, '');
  const publicUrl = externalBase
    ? pub.publicUrl.replace(/^https?:\/\/[^/]+/, externalBase)
    : pub.publicUrl;
  // A host with no dot in it cannot be a public domain, so say so plainly rather than
  // letting the search quietly return zero results.
  if (!/^https?:\/\/[^/]*\.[^/]+/.test(publicUrl)) {
    console.error(
      `uploaded image is not reachable from outside the stack (${publicUrl}) — ` +
      'set SUPABASE_PUBLIC_URL on the edge-functions service to the public API origin',
    );
  }

  // The cleanup used to be a `setTimeout(..., 900000)` registered here. An edge isolate is
  // recycled once its response is done, so a timer 15 minutes out was never reliably
  // reached and uploads accumulated in the bucket indefinitely. Sweeping on the way in
  // needs nothing to stay alive after the response.
  sweepStaleTempImages(supabase);

  return publicUrl;
}

// Best-effort removal of temp uploads older than TEMP_IMAGE_TTL_MS. Fire-and-forget: a
// failure here must never affect the search that triggered it.
const TEMP_IMAGE_TTL_MS = 15 * 60 * 1000;
function sweepStaleTempImages(supabase: any) {
  const sweep = (async () => {
    try {
      const { data: files } = await supabase.storage
        .from('temp-images')
        .list('', { limit: 100, sortBy: { column: 'created_at', order: 'asc' } });
      if (!Array.isArray(files) || files.length === 0) return;
      const cutoff = Date.now() - TEMP_IMAGE_TTL_MS;
      const stale = files
        .filter((f: any) => {
          const created = Date.parse(f?.created_at || f?.updated_at || '');
          return Number.isFinite(created) && created < cutoff;
        })
        .map((f: any) => f.name);
      if (stale.length > 0) {
        await supabase.storage.from('temp-images').remove(stale);
        console.log(`temp-images: swept ${stale.length} stale upload(s)`);
      }
    } catch (e) {
      console.error('temp-images sweep failed:', e instanceof Error ? e.message : e);
    }
  })();
  const waitUntil = (globalThis as any).EdgeRuntime?.waitUntil;
  if (typeof waitUntil === 'function') waitUntil.call((globalThis as any).EdgeRuntime, sweep);
}
