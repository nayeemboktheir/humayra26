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

    const otApiKey = Deno.env.get('OTCOMMERCE_API_KEY');
    if (!otApiKey) {
      return new Response(JSON.stringify({ success: false, error: 'OTCOMMERCE_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const startTime = Date.now();

    // Step 1: Get a public URL for the image (upload base64 to temp bucket if needed)
    let publicImageUrl = imageUrl || '';
    if (imageBase64 && !imageUrl) {
      publicImageUrl = await uploadToTempBucket(imageBase64);
    }

    console.log('Image URL for search:', publicImageUrl.slice(0, 120));

    // Step 2: Convert image URL if not already Alibaba-hosted
    const needsConversion = !publicImageUrl.includes('alicdn.com') && !publicImageUrl.includes('1688.com');
    let searchImgUrl = publicImageUrl;

    if (needsConversion) {
      searchImgUrl = await convertImageUrl(publicImageUrl, apiToken);
      console.log('Converted URL:', String(searchImgUrl).slice(0, 120));
    }

    // Step 3: Use TMAPI to find matching product IDs via image search
    const searchUrl = `http://api.tmapi.top/1688/search/image?apiToken=${apiToken}&img_url=${encodeURIComponent(searchImgUrl)}&page=${page}&page_size=${Math.min(pageSize, 20)}&sort=default`;

    console.log('TMAPI image search request...');
    const resp = await fetch(searchUrl);
    const data = await resp.json();

    if (!resp.ok) {
      console.error('TMAPI error:', JSON.stringify(data).slice(0, 500));
      return new Response(JSON.stringify({ success: false, error: `TMAPI error: ${resp.status} - ${data?.msg || 'Unknown error'}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resultData = data?.data;
    const rawItems = resultData?.items || [];
    const total = resultData?.total || rawItems.length;

    if (!Array.isArray(rawItems) || !rawItems.length) {
      console.warn('TMAPI: No items found');
      return new Response(JSON.stringify({ success: true, data: { items: [], total: 0 }, meta: { method: 'tmapi_image_otapi' } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 4: Extract product IDs from TMAPI results
    const productIds = rawItems
      .map((item: any) => item?.item_id || 0)
      .filter((id: number) => id > 0);

    console.log(`TMAPI found ${productIds.length} product IDs in ${Date.now() - startTime}ms`);

    if (!productIds.length) {
      return new Response(JSON.stringify({ success: true, data: { items: [], total: 0 }, meta: { method: 'tmapi_image_otapi' } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 5: Fetch full product details from OTCommerce for each ID
    const otapiItems = await fetchOtapiDetails(productIds, otApiKey);
    console.log(`OTCommerce returned ${otapiItems.length} items in ${Date.now() - startTime}ms`);

    return new Response(JSON.stringify({
      success: true,
      data: { items: otapiItems, total },
      meta: { method: 'tmapi_image_otapi', provider: 'otapi', tmapiMatches: productIds.length },
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

// Fetch product details from OTCommerce (OTAPI) for a list of product IDs
async function fetchOtapiDetails(productIds: number[], apiKey: string): Promise<any[]> {
  // Fetch in parallel, up to 10 at a time
  const batchSize = 10;
  const results: any[] = [];

  for (let i = 0; i < productIds.length; i += batchSize) {
    const batch = productIds.slice(i, i + batchSize);
    const promises = batch.map(async (numIid) => {
      try {
        const itemId = `abb-${numIid}`;
        const url = `https://otapi.net/service-json/BatchGetItemFullInfo?instanceKey=${encodeURIComponent(apiKey)}&language=en&itemId=${encodeURIComponent(itemId)}&blockList=Description`;
        const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
        const data = await resp.json();

        if (!resp.ok || (data?.ErrorCode && data.ErrorCode !== 'Ok')) {
          console.warn(`OTAPI error for ${numIid}:`, data?.ErrorCode || resp.status);
          return null;
        }

        // Parse the OTAPI item into our standard format
        const item = data?.Result?.Item;
        if (!item) return null;

        return parseOtapiSearchItem(item, numIid);
      } catch (err) {
        console.warn(`Failed to fetch ${numIid}:`, err);
        return null;
      }
    });

    const batchResults = await Promise.all(promises);
    results.push(...batchResults.filter(Boolean));
  }

  return results;
}

// Parse OTAPI item into the same format used by text search results
function parseOtapiSearchItem(item: any, numIid: number): any {
  const price = item?.Price?.OriginalPrice || item?.Price?.ConvertedPriceList?.Internal?.Price || 0;
  const picUrl = item?.MainPictureUrl || '';
  const externalId = item?.Id || '';
  const parsedId = parseInt(externalId.replace(/^abb-/, ''), 10) || numIid;

  const featuredValues = Array.isArray(item?.FeaturedValues) ? item.FeaturedValues : [];
  const getFeatured = (name: string) => featuredValues.find((v: any) => v?.Name === name)?.Value || '';
  const totalSales = parseInt(getFeatured('TotalSales') || '0', 10) || undefined;

  const pics = Array.isArray(item?.Pictures) ? item.Pictures : [];
  const location = item?.Location?.State || item?.Location?.City || '';

  return {
    num_iid: parsedId,
    title: item?.Title || '',
    pic_url: picUrl,
    price: typeof price === 'number' ? price : parseFloat(price) || 0,
    sales: totalSales,
    detail_url: item?.ExternalItemUrl || `https://detail.1688.com/offer/${parsedId}.html`,
    location,
    extra_images: pics.map((p: any) => p?.Url || p?.Large?.Url || '').filter(Boolean),
    vendor_name: item?.VendorName || item?.VendorDisplayName || '',
    stock: item?.MasterQuantity || undefined,
    weight: item?.PhysicalParameters?.Weight || undefined,
  };
}

// Convert non-Alibaba image URL to Alibaba-recognizable format
async function convertImageUrl(imageUrl: string, apiToken: string): Promise<string> {
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
  console.log('Convert response:', resp.status, JSON.stringify(data).slice(0, 300));

  if (!resp.ok || !data?.data) {
    throw new Error(`Image URL conversion failed (${resp.status}): ${data?.msg || 'Unknown error'}`);
  }

  const result = data.data;
  if (typeof result === 'string') return result;
  if (typeof result === 'object' && result !== null) {
    return result.img_url || result.url || result.image_url || String(result);
  }
  return String(result);
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
