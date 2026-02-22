import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // Step 1: Get a public URL for the image (upload base64 to temp bucket if needed)
    let publicImageUrl = imageUrl || '';
    if (imageBase64 && !imageUrl) {
      publicImageUrl = await uploadToTempBucket(imageBase64);
    }

    console.log('Image URL for search:', publicImageUrl.slice(0, 100));

    // Step 2: Convert image URL to Alibaba-recognizable format via TMAPI convert_url
    const convertedUrl = await convertImageUrl(publicImageUrl, apiToken);
    console.log('Converted image URL:', convertedUrl.slice(0, 100));

    // Step 3: Search using the converted URL
    const searchUrl = `http://api.tmapi.top/1688/search/image?apiToken=${apiToken}&img_url=${encodeURIComponent(convertedUrl)}&page=${page}&page_size=${Math.min(pageSize, 20)}&sort=default`;

    console.log('TMAPI search request...');
    const resp = await fetch(searchUrl);
    const data = await resp.json();

    console.log('TMAPI response status:', resp.status);

    if (!resp.ok) {
      console.error('TMAPI error:', JSON.stringify(data).slice(0, 500));
      return new Response(JSON.stringify({ success: false, error: `TMAPI error: ${resp.status} - ${data?.message || 'Unknown error'}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse TMAPI response
    const resultData = data?.data;
    const rawItems = resultData?.items || [];
    const total = resultData?.total || rawItems.length;

    if (!Array.isArray(rawItems) || !rawItems.length) {
      console.warn('TMAPI: No items found. Response keys:', JSON.stringify(Object.keys(data || {})));
      return new Response(JSON.stringify({ success: true, data: { items: [], total: 0 }, meta: { method: 'tmapi_image' } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`TMAPI: ${rawItems.length} items in ${Date.now() - startTime}ms`);

    const items = rawItems.map((item: any) => {
      const itemId = item?.item_id || 0;
      let picUrl = item?.img || '';
      if (picUrl.startsWith('//')) picUrl = 'https:' + picUrl;

      const price = parseFloat(String(item?.price_info?.sale_price || item?.price || '0')) || 0;
      const sales = item?.sale_info?.sale_quantity_int || undefined;
      const location = Array.isArray(item?.delivery_info?.area_from)
        ? item.delivery_info.area_from.join(' ')
        : '';
      const vendorName = item?.shop_info?.shop_name || item?.shop_info?.seller_nick || '';

      return {
        num_iid: itemId,
        title: item?.title || '',
        pic_url: picUrl,
        price,
        sales,
        detail_url: item?.product_url || `https://detail.1688.com/offer/${itemId}.html`,
        location,
        vendor_name: vendorName,
      };
    });

    return new Response(JSON.stringify({
      success: true,
      data: { items, total },
      meta: { method: 'tmapi_image', provider: 'tmapi' },
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

// Convert non-Alibaba image URL to Alibaba-recognizable format
async function convertImageUrl(imageUrl: string, apiToken: string): Promise<string> {
  // If already an Alibaba/1688 URL, no conversion needed
  if (imageUrl.includes('alicdn.com') || imageUrl.includes('1688.com')) {
    return imageUrl;
  }

  const convertUrl = `http://api.tmapi.top/1688/tools/image/convert_url?apiToken=${apiToken}`;
  console.log('Converting image URL via TMAPI...');

  const resp = await fetch(convertUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: imageUrl,
      search_api_endpoint: '/search/image',
    }),
  });

  const data = await resp.json();
  console.log('Convert response status:', resp.status, 'keys:', JSON.stringify(Object.keys(data || {})));

  if (!resp.ok || !data?.data) {
    console.error('Convert URL failed:', JSON.stringify(data).slice(0, 500));
    throw new Error(`Image URL conversion failed: ${data?.message || resp.status}`);
  }

  // The converted result is typically an image path that can be used directly as img_url
  return data.data;
}

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
