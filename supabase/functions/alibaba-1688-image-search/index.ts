import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const TMAPI_BASE = 'https://api.tmapi.top';

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
    let imgUrl = imageUrl || '';

    // Step 1: If base64, upload to temp bucket to get a public URL
    if (imageBase64 && !imageUrl) {
      console.log('Uploading base64 image to temp bucket...');
      imgUrl = await uploadToTempBucket(imageBase64);
    }

    console.log('Image URL for TMAPI search:', imgUrl.slice(0, 120));

    // Step 2: Convert non-Alibaba image URL using TMAPI image conversion API
    let searchImgUrl = imgUrl;
    if (!imgUrl.includes('alicdn.com') && !imgUrl.includes('alibaba')) {
      console.log('Converting non-Ali image URL via TMAPI...');
      const convertUrl = `${TMAPI_BASE}/1688/image/upload?apiToken=${encodeURIComponent(apiToken)}`;
      const convertResp = await fetch(convertUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: imgUrl }),
      });
      const convertData = await convertResp.json();
      console.log('Image conversion result:', JSON.stringify(convertData).slice(0, 300));
      if (convertData?.data?.img_url) {
        searchImgUrl = convertData.data.img_url;
      } else {
        console.error('Image conversion failed:', JSON.stringify(convertData));
        // Try with original URL anyway
      }
    }

    // Step 3: Call TMAPI multilingual image search API
    const effectivePageSize = Math.min(pageSize, 20); // TMAPI max is 20
    const searchParams = new URLSearchParams({
      apiToken,
      img_url: searchImgUrl,
      page: String(page),
      page_size: String(effectivePageSize),
      language: 'en',
    });
    const searchUrl = `${TMAPI_BASE}/1688/multi-language/search/image?${searchParams.toString()}`;

    console.log(`TMAPI image search page ${page}, pageSize ${effectivePageSize}...`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    let resp: Response;
    try {
      resp = await fetch(searchUrl, { signal: controller.signal });
    } catch (fetchErr: any) {
      clearTimeout(timeout);
      const isTimeout = fetchErr?.name === 'AbortError';
      console.error('TMAPI fetch failed:', isTimeout ? 'timeout' : fetchErr?.message);
      return new Response(JSON.stringify({
        success: false,
        error: isTimeout ? 'TMAPI timed out, please try again' : 'TMAPI request failed',
      }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    clearTimeout(timeout);

    let searchData: any;
    try {
      searchData = await resp.json();
    } catch {
      console.error('Failed to parse TMAPI response');
      return new Response(JSON.stringify({
        success: true,
        data: { items: [], total: 0 },
        meta: { method: 'tmapi_image', convertedImageUrl: searchImgUrl, note: 'parse_error' },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log('TMAPI response code:', searchData?.code, 'msg:', searchData?.msg);

    if (searchData?.code !== 200 && searchData?.code !== 0) {
      const errMsg = searchData?.msg || searchData?.error || `TMAPI error: ${resp.status}`;
      console.error('TMAPI error:', errMsg);
      return new Response(JSON.stringify({ success: false, error: errMsg }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawItems = searchData?.data?.items || [];
    const total = searchData?.data?.total || rawItems.length;
    console.log(`TMAPI page ${page}: ${rawItems.length} items, total: ${total}, took ${Date.now() - startTime}ms`);

    if (!rawItems.length) {
      return new Response(JSON.stringify({
        success: true,
        data: { items: [], total: 0 },
        meta: { method: 'tmapi_image', convertedImageUrl: searchImgUrl },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Map TMAPI items to Product1688 format
    const items = rawItems.map((item: any) => ({
      num_iid: parseInt(String(item.num_iid || item.offer_id || '0'), 10) || 0,
      title: item.title || '',
      pic_url: item.pic_url || item.main_image || '',
      price: parseFloat(String(item.price || '0')) || 0,
      promotion_price: item.promotion_price ? parseFloat(String(item.promotion_price)) : undefined,
      sales: parseInt(String(item.sales || item.monthly_sales || '0'), 10) || undefined,
      detail_url: item.detail_url || item.product_url || `https://detail.1688.com/offer/${item.num_iid || item.offer_id}.html`,
      location: item.location || item.area || '',
      vendor_name: item.vendor_name || item.shop_name || item.seller_nick || '',
    }));

    console.log(`TMAPI image search complete: ${items.length} items in ${Date.now() - startTime}ms`);

    return new Response(JSON.stringify({
      success: true,
      data: { items, total },
      meta: { method: 'tmapi_image', page, pageSize: effectivePageSize, convertedImageUrl: searchImgUrl },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in image search:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to search by image',
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

// Upload base64 image to temp bucket and return public URL
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
  }, 60000);

  return pub.publicUrl;
}
