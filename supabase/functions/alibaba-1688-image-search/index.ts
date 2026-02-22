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
    const { imageBase64, imageUrl, page = 1, pageSize = 40 } = await req.json();

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
    let convertedImageUrl = imgUrl;
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

      const converted = convertData?.data?.image_url || convertData?.data?.img_url;
      if (converted) {
        convertedImageUrl = converted;
        console.log('Converted image URL:', convertedImageUrl);
      } else {
        console.warn('Image conversion failed, using original URL');
      }
    }

    // Step 3: Call TMAPI image search
    const tmapiPageSize = 20; // TMAPI max per page
    const searchUrl = `${TMAPI_BASE}/search/image?apiToken=${apiToken}&img_url=${encodeURIComponent(convertedImageUrl)}&page=${page}&page_size=${tmapiPageSize}&sort=default`;

    console.log(`TMAPI image search page ${page}...`);
    const resp = await fetch(searchUrl);
    const searchData = await resp.json();

    if (!resp.ok || searchData?.code !== 200) {
      const errMsg = searchData?.msg || searchData?.message || `TMAPI error: ${resp.status}`;
      console.error('TMAPI error:', errMsg);
      return new Response(JSON.stringify({ success: false, error: errMsg }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawItems = searchData?.data?.items || [];
    // TMAPI often reports low totals for image search; use at least 100 to enable pagination
    const reportedTotal = searchData?.data?.total_results || rawItems.length;
    const total = Math.max(reportedTotal, rawItems.length > 0 ? 100 : 0);
    console.log(`TMAPI page ${page}: ${rawItems.length} items, reported total: ${reportedTotal}, effective total: ${total}`);

    if (!rawItems.length) {
      return new Response(JSON.stringify({ 
        success: true, 
        data: { items: [], total: 0 }, 
        meta: { method: 'tmapi_image', convertedImageUrl } 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract item IDs from TMAPI results
    const itemIds = rawItems
      .map((item: any) => parseInt(String(item.item_id || '0'), 10))
      .filter((id: number) => id > 0);

    // Always enrich with OTAPI for English titles
    const otapiKey = Deno.env.get('OTCOMMERCE_API_KEY');
    if (!otapiKey) {
      console.warn('OTCOMMERCE_API_KEY not configured, returning TMAPI results (Chinese)');
      const items = rawItems.map((item: any) => mapTmapiItem(item));
      return new Response(JSON.stringify({
        success: true,
        data: { items, total },
        meta: { method: 'tmapi_image', page, pageSize, convertedImageUrl },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Fetching ${itemIds.length} items from OTAPI for English titles...`);
    const otapiItems = await fetchOtapiItems(itemIds, otapiKey);

    // Merge: preserve TMAPI order, use OTAPI data where available, fallback to TMAPI
    const mergedItems = rawItems.map((tmapiItem: any) => {
      const itemId = parseInt(String(tmapiItem.item_id || '0'), 10);
      const otapiItem = otapiItems.get(itemId);
      if (otapiItem) return otapiItem;
      return mapTmapiItem(tmapiItem);
    });

    console.log(`Image search page ${page}: ${mergedItems.length} items (${otapiItems.size} from OTAPI) in ${Date.now() - startTime}ms`);

    return new Response(JSON.stringify({
      success: true,
      data: { items: mergedItems, total },
      meta: { method: 'tmapi_image_otapi', page, pageSize, convertedImageUrl },
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
  let successCount = 0;
  let errorCount = 0;

  const fetchItem = (numIid: number) => {
    return (async () => {
      try {
        const itemId = `abb-${numIid}`;
        const url = `https://otapi.net/service-json/BatchGetItemFullInfo?instanceKey=${encodeURIComponent(apiKey)}&language=en&itemId=${encodeURIComponent(itemId)}&blockList=Description`;
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        });

        if (!response.ok) {
          errorCount++;
          console.warn(`OTAPI HTTP ${response.status} for ${numIid}`);
          return;
        }
        const data = await response.json();
        if (data?.ErrorCode && data.ErrorCode !== 'Ok') {
          errorCount++;
          console.warn(`OTAPI error for ${numIid}: ${data.ErrorCode} - ${data.ErrorDescription || ''}`);
          return;
        }

        const item = data?.Result?.Item;
        if (!item) {
          errorCount++;
          console.warn(`OTAPI no item data for ${numIid}`);
          return;
        }

        successCount++;
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
        errorCount++;
        console.warn(`OTAPI fetch error for ${numIid}: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    })();
  };

  await Promise.all(itemIds.map(fetchItem));
  console.log(`OTAPI fetch summary: ${successCount} success, ${errorCount} errors out of ${itemIds.length} items`);

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
