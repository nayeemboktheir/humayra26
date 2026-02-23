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
    let imgUrl = imageUrl || '';

    // Step 1: If base64, upload to temp bucket to get a public URL
    if (imageBase64 && !imageUrl) {
      console.log('Uploading base64 image to temp bucket...');
      imgUrl = await uploadToTempBucket(imageBase64);
    }

    console.log('Image URL before conversion:', imgUrl.slice(0, 120));

    // Step 2: Convert non-Alibaba images using TMAPI image convert endpoint
    if (!imgUrl.includes('alicdn.com') && !imgUrl.includes('aliyuncs.com')) {
      console.log('Converting image via TMAPI convert endpoint...');
      try {
        const convertResp = await fetch(
          `${TMAPI_BASE}/tools/image/convert_url?apiToken=${encodeURIComponent(apiToken)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: imgUrl,
              search_api_endpoint: '/global/search/image',
            }),
          }
        );
        const convertData = await convertResp.json();
        console.log('TMAPI convert response:', JSON.stringify(convertData).slice(0, 300));

        if (convertData?.code === 200 && convertData?.data) {
          const d = convertData.data;
          const possibleUrl = d.image_url || d.img_url || d.url || (typeof d === 'string' ? d : '');
          if (possibleUrl) {
            imgUrl = possibleUrl;
            console.log('Converted image URL:', imgUrl.slice(0, 120));
          } else {
            console.warn('Image conversion returned unexpected data format:', JSON.stringify(d).slice(0, 200));
          }
        } else {
          console.warn('Image conversion failed:', JSON.stringify(convertData).slice(0, 200));
        }
      } catch (convErr) {
        console.warn('Image conversion error, using original URL:', convErr);
      }
    }

    // Step 3: Call TMAPI multilingual image search (max page_size = 20)
    const effectivePageSize = Math.min(pageSize, 20);
    const searchUrl = `${TMAPI_BASE}/global/search/image?apiToken=${encodeURIComponent(apiToken)}&img_url=${encodeURIComponent(imgUrl)}&language=en&page=${page}&page_size=${effectivePageSize}&sort=default`;

    console.log(`TMAPI image search page ${page}, pageSize ${effectivePageSize}...`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    let resp: Response;
    try {
      resp = await fetch(searchUrl, { signal: controller.signal });
    } catch (fetchErr: any) {
      clearTimeout(timeout);
      const isTimeout = fetchErr?.name === 'AbortError';
      console.error('TMAPI fetch failed:', isTimeout ? 'timeout' : fetchErr?.message);
      return new Response(JSON.stringify({
        success: false,
        error: isTimeout ? 'TMAPI API timed out, please try again' : `TMAPI API request failed: ${fetchErr?.message}`,
      }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    clearTimeout(timeout);

    let rawText: string;
    try {
      rawText = await resp.text();
    } catch (readErr) {
      console.error('Failed to read TMAPI response body:', readErr);
      return new Response(JSON.stringify({ success: false, error: 'Failed to read TMAPI response' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!rawText || rawText.length < 2) {
      console.error('TMAPI returned empty response, status:', resp.status);
      return new Response(JSON.stringify({
        success: true,
        data: { items: [], total: 0 },
        meta: { method: 'tmapi_image', convertedImageUrl: imgUrl, note: 'empty_response' },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let searchData: any;
    try {
      searchData = JSON.parse(rawText);
    } catch {
      console.error('TMAPI JSON parse failed, response:', rawText.slice(0, 500));
      return new Response(JSON.stringify({
        success: true,
        data: { items: [], total: 0 },
        meta: { method: 'tmapi_image', convertedImageUrl: imgUrl, note: 'parse_error' },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log('TMAPI response code:', searchData?.code, 'status:', resp.status);

    if (searchData?.code && searchData.code !== 200) {
      const errMsg = searchData?.msg || searchData?.message || `TMAPI error code: ${searchData.code}`;
      console.error('TMAPI API error:', errMsg);
      return new Response(JSON.stringify({ success: false, error: errMsg }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse TMAPI response — items are in data.items or data.result
    const resultData = searchData?.data || searchData;
    const rawItems = resultData?.items || resultData?.result || [];
    const total = resultData?.total || resultData?.total_count || rawItems.length;
    console.log(`TMAPI page ${page}: ${rawItems.length} items, total: ${total}, took ${Date.now() - startTime}ms`);

    if (!rawItems.length) {
      return new Response(JSON.stringify({
        success: true,
        data: { items: [], total: 0 },
        meta: { method: 'tmapi_image', convertedImageUrl: imgUrl },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Map TMAPI items to Product1688 format
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

    console.log(`TMAPI image search complete: ${items.length} items in ${Date.now() - startTime}ms`);

    return new Response(JSON.stringify({
      success: true,
      data: { items, total },
      meta: { method: 'tmapi_image', page, pageSize: effectivePageSize, convertedImageUrl: imgUrl },
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
