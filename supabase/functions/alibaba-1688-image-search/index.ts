import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    const { imageBase64, imageUrl, page = 1, pageSize = 20 } = await req.json();

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
    let imgUrl = imageUrl || '';
    let originalUrl = imgUrl;

    // PATH 1: Already an alicdn URL → search directly (fast path for pagination)
    const isAlicdn = imgUrl && (imgUrl.includes('alicdn.com') || imgUrl.includes('aliyuncs.com'));
    if (isAlicdn) {
      console.log(`Direct TMAPI search: alicdn URL, page ${page}`);
      return await doImageSearch(imgUrl, page, effectivePageSize, apiToken, startTime, imgUrl, imgUrl);
    }

    // PATH 2: Already a converted path (starts with /) → use V2 endpoint directly
    if (imgUrl && imgUrl.startsWith('/')) {
      console.log(`V2 search with converted path, page ${page}`);
      return await doImageSearchV2(imgUrl, page, effectivePageSize, apiToken, startTime, imgUrl, originalUrl);
    }

    // PATH 3: User-uploaded image (base64 or external URL) → convert first, then search with V2
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
      // Use V2 endpoint with the converted path
      return await doImageSearchV2(convertedPath, page, effectivePageSize, apiToken, startTime, convertedPath, originalUrl);
    }

    // Convert failed — return empty so client can use OTAPI fallback
    console.log('Convert failed, returning empty for OTAPI fallback');
    return new Response(JSON.stringify({
      success: true,
      data: { items: [], total: 0 },
      meta: { method: 'tmapi_image', convertedImageUrl: imgUrl, originalImageUrl: originalUrl, note: 'convert_failed' },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

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
): Promise<Response> {
  const endpoints = [
    `${TMAPI_BASE}/search/image?apiToken=${encodeURIComponent(apiToken)}&img_url=${encodeURIComponent(imgUrl)}&page=${page}&page_size=${pageSize}&sort=default`,
    `${TMAPI_BASE}/global/search/image?apiToken=${encodeURIComponent(apiToken)}&img_url=${encodeURIComponent(imgUrl)}&language=en&page=${page}&page_size=${pageSize}&sort=default`,
  ];

  for (const searchUrl of endpoints) {
    const epName = searchUrl.includes('/global/') ? 'global' : 'standard';
    const result = await fetchAndParse(searchUrl, epName, pageSize, apiToken, startTime, convertedUrl, originalUrl, page);
    if (result) return result;
  }

  return emptyResponse(convertedUrl, originalUrl);
}

// Search with V2 endpoint (for converted image paths from convert_url)
async function doImageSearchV2(
  imgPath: string, page: number, pageSize: number,
  apiToken: string, startTime: number, convertedUrl: string, originalUrl: string = '',
): Promise<Response> {
  const searchUrl = `${TMAPI_BASE}/global/search/image/v2?apiToken=${encodeURIComponent(apiToken)}&img_url=${encodeURIComponent(imgPath)}&language=en&page=${page}&page_size=${pageSize}&sort=default`;

  const result = await fetchAndParse(searchUrl, 'v2', pageSize, apiToken, startTime, convertedUrl, originalUrl, page);
  if (result) return result;

  // V2 failed, try standard endpoints with full URL if it looks like a path
  if (imgPath.startsWith('/')) {
    const fullUrl = `https://cbu01.alicdn.com${imgPath}`;
    console.log('V2 failed, trying standard with full URL...');
    return await doImageSearch(fullUrl, page, pageSize, apiToken, startTime, convertedUrl, originalUrl);
  }

  return emptyResponse(convertedUrl, originalUrl);
}

// Shared fetch + parse logic
async function fetchAndParse(
  searchUrl: string, epName: string, pageSize: number,
  apiToken: string, startTime: number, convertedUrl: string, originalUrl: string, page: number,
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

  console.log(`${epName}: ${items.length} items in ${Date.now() - startTime}ms`);
  return new Response(JSON.stringify({
    success: true,
    data: { items, total },
    meta: { method: 'tmapi_image', page, pageSize, convertedImageUrl: convertedUrl, originalImageUrl: originalUrl || convertedUrl },
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function emptyResponse(convertedUrl: string, originalUrl: string): Response {
  return new Response(JSON.stringify({
    success: true, data: { items: [], total: 0 },
    meta: { method: 'tmapi_image', convertedImageUrl: convertedUrl, originalImageUrl: originalUrl || convertedUrl },
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// Convert URL via TMAPI — returns image path for V2 endpoint
async function convertImageUrl(imgUrl: string, apiToken: string): Promise<string> {
  try {
    const convertResp = await fetch(
      `${TMAPI_BASE}/tools/image/convert_url?apiToken=${encodeURIComponent(apiToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: imgUrl, search_api_endpoint: '/global/search/image/v2' }),
      }
    );
    const rawText = await convertResp.text();
    console.log('Convert raw:', rawText.slice(0, 300));
    if (!rawText || rawText.length < 2) return imgUrl;
    let convertData: any;
    try { convertData = JSON.parse(rawText); } catch { return imgUrl; }
    if (convertData?.code === 200 && convertData?.data) {
      const d = convertData.data;
      // The result is typically an image path like /search/imgextra5/...
      const result = d.image_url || d.img_url || d.url || (typeof d === 'string' ? d : '') || '';
      if (result) return result;
    }
  } catch (e) {
    console.log('Convert error:', e);
  }
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

  setTimeout(async () => {
    try { await supabase.storage.from('temp-images').remove([fileName]); } catch {}
  }, 900000);

  return pub.publicUrl;
}
