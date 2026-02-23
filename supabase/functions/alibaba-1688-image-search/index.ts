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

    // FAST PATH: If we already have an alicdn URL (pages 2+), search directly — zero overhead
    const isAlreadyConverted = imgUrl && (imgUrl.includes('alicdn.com') || imgUrl.includes('aliyuncs.com'));
    if (isAlreadyConverted) {
      console.log(`Fast path: alicdn URL, page ${page}`);
      return await doImageSearch(imgUrl, page, effectivePageSize, apiToken, startTime, imgUrl);
    }

    // Step 1: If base64, upload to temp bucket (we need an HTTP URL)
    if (imageBase64 && !imgUrl) {
      console.log('Uploading base64...');
      imgUrl = await uploadToTempBucket(imageBase64);
      console.log('Upload:', Date.now() - startTime, 'ms');
    }

    // Step 2: Try DIRECT search first (skip convert — saves ~800ms)
    console.log('Trying direct search (no convert)...');
    const directResult = await doImageSearch(imgUrl, page, effectivePageSize, apiToken, startTime, imgUrl);
    const directBody = await directResult.clone().json();

    if (directBody.success && directBody.data?.items?.length > 0) {
      console.log(`Direct search OK: ${directBody.data.items.length} items in ${Date.now() - startTime}ms — convert skipped!`);
      // Background: convert URL for future pagination (non-blocking)
      convertUrlInBackground(imgUrl, apiToken);
      return directResult;
    }

    // Step 3: Direct search returned 0 results — try with converted URL
    console.log('Direct search empty, converting image...');
    const convertedUrl = await convertImageUrl(imgUrl, apiToken);
    if (convertedUrl && convertedUrl !== imgUrl) {
      console.log('Convert done:', Date.now() - startTime, 'ms');
      return await doImageSearch(convertedUrl, page, effectivePageSize, apiToken, startTime, convertedUrl);
    }

    // Return the empty direct result
    return directResult;

  } catch (error) {
    console.error('Error in image search:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to search by image',
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

// Core search function — single responsibility
async function doImageSearch(
  imgUrl: string, page: number, pageSize: number,
  apiToken: string, startTime: number, convertedUrl: string,
): Promise<Response> {
  const searchUrl = `${TMAPI_BASE}/global/search/image?apiToken=${encodeURIComponent(apiToken)}&img_url=${encodeURIComponent(imgUrl)}&language=en&page=${page}&page_size=${pageSize}&sort=default`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  let resp: Response;
  try {
    resp = await fetch(searchUrl, { signal: controller.signal });
  } catch (fetchErr: any) {
    clearTimeout(timeout);
    const isTimeout = fetchErr?.name === 'AbortError';
    return new Response(JSON.stringify({
      success: false,
      error: isTimeout ? 'Search timed out' : `Search failed: ${fetchErr?.message}`,
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  clearTimeout(timeout);

  const rawText = await resp.text();
  if (!rawText || rawText.length < 2) {
    return new Response(JSON.stringify({
      success: true, data: { items: [], total: 0 },
      meta: { method: 'tmapi_image', convertedImageUrl: convertedUrl },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  let searchData: any;
  try { searchData = JSON.parse(rawText); } catch {
    return new Response(JSON.stringify({
      success: true, data: { items: [], total: 0 },
      meta: { method: 'tmapi_image', convertedImageUrl: convertedUrl, note: 'parse_error' },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  if (searchData?.code && searchData.code !== 200) {
    // Don't fail — return empty for fallback to convert path
    return new Response(JSON.stringify({
      success: true, data: { items: [], total: 0 },
      meta: { method: 'tmapi_image', convertedImageUrl: convertedUrl, note: `api_code_${searchData.code}` },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const resultData = searchData?.data || searchData;
  const rawItems = resultData?.items || resultData?.result || [];
  const total = resultData?.total || resultData?.total_count || rawItems.length;

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

  console.log(`Search: ${items.length} items in ${Date.now() - startTime}ms`);

  return new Response(JSON.stringify({
    success: true,
    data: { items, total },
    meta: { method: 'tmapi_image', page, pageSize, convertedImageUrl: convertedUrl },
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// Convert URL via TMAPI (only called if direct search fails)
async function convertImageUrl(imgUrl: string, apiToken: string): Promise<string> {
  try {
    const convertResp = await fetch(
      `${TMAPI_BASE}/tools/image/convert_url?apiToken=${encodeURIComponent(apiToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: imgUrl, search_api_endpoint: '/global/search/image' }),
      }
    );
    const convertData = await convertResp.json();
    if (convertData?.code === 200 && convertData?.data) {
      const d = convertData.data;
      let result = d.image_url || d.img_url || d.url || (typeof d === 'string' ? d : '') || imgUrl;
      // Ensure full URL — TMAPI sometimes returns relative paths like /search/imgextra5/...
      if (result && result.startsWith('/')) {
        result = `https://cbu01.alicdn.com${result}`;
      }
      return result;
    }
  } catch {}
  return imgUrl;
}

// Non-blocking background convert (fire and forget for pagination optimization)
function convertUrlInBackground(imgUrl: string, apiToken: string) {
  convertImageUrl(imgUrl, apiToken).then(url => {
    if (url !== imgUrl) console.log('Background convert done:', url.slice(0, 80));
  }).catch(() => {});
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

  // Clean up after 15 minutes
  setTimeout(async () => {
    try { await supabase.storage.from('temp-images').remove([fileName]); } catch {}
  }, 900000);

  return pub.publicUrl;
}
