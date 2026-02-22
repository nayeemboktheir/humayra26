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

    console.log('Image URL for search:', imgUrl.slice(0, 120));

    // Step 2: Check if the image is from an Alibaba domain; if not, convert it
    const isAliImage = /alicdn\.com|1688\.com|taobao\.com|tmall\.com/i.test(imgUrl);
    if (!isAliImage) {
      console.log('Non-Ali image detected, converting via TMAPI...');
      const convertResp = await fetch(`${TMAPI_BASE}/tools/image/convert_url?apiToken=${apiToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: imgUrl }),
      });
      const convertData = await convertResp.json();
      console.log('Convert response:', JSON.stringify(convertData).slice(0, 300));

      const convertedUrl = convertData?.data?.image_url || convertData?.data?.img_url;
      if (convertedUrl) {
        imgUrl = convertedUrl;
        console.log('Converted image URL:', imgUrl);
      } else {
        console.warn('Image conversion failed, using original URL');
      }
    }

    // Step 3: Call TMAPI image search to get item IDs
    const searchUrl = `${TMAPI_BASE}/search/image?apiToken=${apiToken}&img_url=${encodeURIComponent(imgUrl)}&page=${page}&page_size=${Math.min(pageSize, 20)}&sort=default`;

    console.log('TMAPI image search request...');
    const resp = await fetch(searchUrl);
    const data = await resp.json();

    console.log('TMAPI response status:', resp.status, 'items:', data?.data?.items?.length);

    if (!resp.ok || data?.code !== 200) {
      const errMsg = data?.msg || data?.message || `TMAPI error: ${resp.status}`;
      console.error('TMAPI error:', errMsg);
      return new Response(JSON.stringify({ success: false, error: errMsg }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawItems = data?.data?.items || [];
    const total = data?.data?.total_results || rawItems.length;

    if (!Array.isArray(rawItems) || !rawItems.length) {
      return new Response(JSON.stringify({ success: true, data: { items: [], total: 0 }, meta: { method: 'tmapi_image_otapi' } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract item IDs from TMAPI results
    const itemIds = rawItems
      .map((item: any) => parseInt(String(item.item_id || '0'), 10))
      .filter((id: number) => id > 0);

    console.log(`TMAPI found ${itemIds.length} item IDs, fetching from OTAPI...`);

    // Step 4: Fetch product details from OTAPI (in parallel batches)
    const otapiKey = Deno.env.get('OTCOMMERCE_API_KEY');
    if (!otapiKey) {
      // Fallback to TMAPI results if OTAPI not configured
      console.warn('OTCOMMERCE_API_KEY not configured, returning TMAPI results');
      const items = rawItems.map((item: any) => mapTmapiItem(item));
      return new Response(JSON.stringify({
        success: true,
        data: { items, total },
        meta: { method: 'tmapi_image', page, pageSize },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

// Fetch items from OTAPI in parallel (all at once with timeout)
    const otapiItems = await fetchOtapiItems(itemIds, otapiKey);

    // Merge: preserve TMAPI order, use OTAPI data where available, fallback to TMAPI
    const mergedItems = rawItems.map((tmapiItem: any) => {
      const itemId = parseInt(String(tmapiItem.item_id || '0'), 10);
      const otapiItem = otapiItems.get(itemId);
      if (otapiItem) {
        return otapiItem;
      }
      // Fallback to TMAPI data
      return mapTmapiItem(tmapiItem);
    });

    console.log(`Image search completed: ${mergedItems.length} items (${otapiItems.size} from OTAPI) in ${Date.now() - startTime}ms`);

    return new Response(JSON.stringify({
      success: true,
      data: { items: mergedItems, total },
      meta: { method: 'tmapi_image_otapi', page, pageSize },
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

// Map TMAPI item to Product1688 format (fallback)
function mapTmapiItem(item: any) {
  return {
    num_iid: parseInt(String(item.item_id || '0'), 10) || 0,
    title: item.title || '',
    pic_url: item.img || '',
    price: parseFloat(String(item.price_info?.sale_price || item.price || '0')) || 0,
    promotion_price: item.price_info?.origin_price !== item.price_info?.sale_price
      ? parseFloat(String(item.price_info?.origin_price || '0')) || undefined
      : undefined,
    sales: item.sale_info?.sale_quantity_int || parseInt(String(item.sale_info?.sale_quantity || '0'), 10) || undefined,
    detail_url: item.product_url || `https://detail.1688.com/offer/${item.item_id}.html`,
    location: item.delivery_info?.area_from || '',
    vendor_name: item.shop_info?.shop_name || item.shop_info?.seller_nick || '',
  };
}

// Fetch multiple items from OTAPI in parallel
async function fetchOtapiItems(itemIds: number[], apiKey: string): Promise<Map<number, any>> {
  const results = new Map<number, any>();
  const TIMEOUT_MS = 4000;

  const fetchWithTimeout = (numIid: number) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    return (async () => {
      try {
        const itemId = `abb-${numIid}`;
        const url = `https://otapi.net/service-json/BatchGetItemFullInfo?instanceKey=${encodeURIComponent(apiKey)}&language=en&itemId=${encodeURIComponent(itemId)}&blockList=Description`;
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!response.ok) return;
        const data = await response.json();
        if (data?.ErrorCode && data.ErrorCode !== 'Ok') return;

        const item = data?.Result?.Item;
        if (!item) return;

        const price = item?.Price?.OriginalPrice || 0;
        const pics = Array.isArray(item?.Pictures) ? item.Pictures : [];
        const featuredValues = Array.isArray(item?.FeaturedValues) ? item.FeaturedValues : [];
        const getFeatured = (name: string) => featuredValues.find((v: any) => v?.Name === name)?.Value || '';
        const location = item?.Location?.State || item?.Location?.City || '';
        const externalId = item?.Id || '';
        const parsedId = parseInt(externalId.replace(/^abb-/, ''), 10) || numIid;

        results.set(numIid, {
          num_iid: parsedId,
          title: item?.Title || '',
          pic_url: item?.MainPictureUrl || pics[0]?.Url || '',
          price: typeof price === 'number' ? price : parseFloat(price) || 0,
          sales: parseInt(getFeatured('TotalSales') || '0', 10) || undefined,
          detail_url: item?.ExternalItemUrl || `https://detail.1688.com/offer/${parsedId}.html`,
          location,
          extra_images: pics.map((p: any) => p?.Url || p?.Large?.Url || '').filter(Boolean),
          vendor_name: item?.VendorName || item?.VendorDisplayName || '',
          stock: item?.MasterQuantity || undefined,
          weight: item?.PhysicalParameters?.Weight || undefined,
        });
      } catch (err) {
        clearTimeout(timer);
        // Timeout or network error — skip silently
      }
    })();
  };

  // Fire ALL requests in parallel (no batching)
  await Promise.all(itemIds.map(fetchWithTimeout));

  return results;
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
