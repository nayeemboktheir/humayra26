import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_LENS_HOST = 'google-lens2.p.rapidapi.com';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, imageUrl, page = 1, pageSize = 20, keyword = '' } = await req.json();

    if (!imageBase64 && !imageUrl) {
      return new Response(JSON.stringify({ success: false, error: 'Image is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rapidApiKey = (Deno.env.get('RAPIDAPI_KEY') ?? '').trim();
    if (!rapidApiKey) {
      return new Response(JSON.stringify({ success: false, error: 'RapidAPI key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const otapiKey = Deno.env.get('OTCOMMERCE_API_KEY');
    if (!otapiKey) {
      return new Response(JSON.stringify({ success: false, error: '1688 API not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 1: Get a public URL for the image
    let publicImageUrl = imageUrl || '';

    if (!publicImageUrl && imageBase64) {
      publicImageUrl = await uploadToTempStorage(imageBase64);
      if (!publicImageUrl) {
        return new Response(JSON.stringify({ success: false, error: 'Failed to upload image' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    console.log('Step 1: Image URL ready:', publicImageUrl);

    // Step 2: Use Google Lens to identify the product
    const lensUrl = `https://${GOOGLE_LENS_HOST}/image-search?url=${encodeURIComponent(publicImageUrl)}&country=us&language=en`;

    console.log('Step 2: Calling Google Lens...');
    const lensResp = await fetch(lensUrl, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': rapidApiKey,
        'x-rapidapi-host': GOOGLE_LENS_HOST,
      },
    });

    const lensData = await lensResp.json().catch(() => null);

    if (!lensResp.ok || !lensData) {
      console.error('Google Lens failed:', lensResp.status, lensData);
      return new Response(JSON.stringify({
        success: false,
        error: 'Google Lens identification failed. Make sure you are subscribed to the Google Lens API on RapidAPI.',
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract product name from Lens results
    let detectedQuery = '';

    // Try visual_matches titles first
    const visualMatches = lensData?.visual_matches || lensData?.data?.visual_matches || [];
    if (visualMatches.length > 0) {
      // Pick the most descriptive title from top matches
      const titles = visualMatches.slice(0, 5).map((m: any) => m.title || '').filter(Boolean);
      if (titles.length > 0) {
        detectedQuery = titles[0];
      }
    }

    // Try search text / knowledge graph
    if (!detectedQuery) {
      detectedQuery = lensData?.search?.title
        || lensData?.knowledge_graph?.title
        || lensData?.data?.search?.title
        || lensData?.data?.knowledge_graph?.title
        || '';
    }

    // Try text annotations
    if (!detectedQuery && lensData?.text_results?.length) {
      detectedQuery = lensData.text_results[0]?.text || '';
    }

    // Use user-provided keyword as fallback or combine
    if (keyword && detectedQuery) {
      detectedQuery = `${keyword} ${detectedQuery}`;
    } else if (keyword && !detectedQuery) {
      detectedQuery = keyword;
    }

    if (!detectedQuery) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Could not identify the product from the image. Try adding a keyword hint.',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Keep query concise for 1688 search (max ~50 chars, remove noise)
    detectedQuery = detectedQuery.replace(/[^a-zA-Z0-9\s\u4e00-\u9fff]/g, ' ').trim().slice(0, 80);

    console.log('Step 2 result: Detected product query:', detectedQuery);

    // Step 3: Search 1688 via OTAPI using the detected product name
    const framePosition = (page - 1) * pageSize;
    const xmlParams = `<SearchItemsParameters><ItemTitle>${escapeXml(detectedQuery)}</ItemTitle><Provider>Alibaba1688</Provider></SearchItemsParameters>`;
    const otapiUrl = `https://otapi.net/service-json/SearchItemsFrame?instanceKey=${encodeURIComponent(otapiKey)}&language=en&xmlParameters=${encodeURIComponent(xmlParams)}&framePosition=${framePosition}&frameSize=${pageSize}`;

    console.log('Step 3: Searching 1688 for:', detectedQuery);

    const searchResp = await fetch(otapiUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    const searchData = await searchResp.json().catch(() => null);

    if (!searchResp.ok || (searchData?.ErrorCode && searchData.ErrorCode !== 'Ok' && searchData.ErrorCode !== 'None')) {
      console.error('OTAPI search failed:', searchData);
      return new Response(JSON.stringify({
        success: false,
        error: searchData?.ErrorMessage || 'Failed to search 1688',
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawItems = searchData?.Result?.Items?.Content || [];
    const totalCount = searchData?.Result?.Items?.TotalCount || rawItems.length;

    console.log(`Step 3 result: Found ${rawItems.length} items on 1688 (total: ${totalCount})`);

    // Parse OTAPI items into standard format
    const items = rawItems.map((item: any) => {
      const price = item?.Price?.OriginalPrice || item?.Price?.ConvertedPriceList?.Internal?.Price || 0;
      const picUrl = item?.MainPictureUrl || item?.Pictures?.[0]?.Url || '';
      const externalId = item?.Id || '';
      const numIid = parseInt(externalId.replace(/^abb-/, ''), 10) || 0;
      const featuredValues = Array.isArray(item?.FeaturedValues) ? item.FeaturedValues : [];
      const totalSales = parseInt(featuredValues.find((v: any) => v?.Name === 'TotalSales')?.Value || '0', 10) || undefined;
      const pics = Array.isArray(item?.Pictures) ? item.Pictures : [];
      const location = item?.Location?.State || item?.Location?.City || '';

      return {
        num_iid: numIid,
        title: item?.Title || '',
        pic_url: picUrl,
        price: typeof price === 'number' ? price : parseFloat(price) || 0,
        promotion_price: undefined,
        sales: totalSales,
        detail_url: item?.ExternalItemUrl || `https://detail.1688.com/offer/${numIid}.html`,
        location,
        vendor_name: item?.VendorName || item?.VendorDisplayName || '',
      };
    });

    return new Response(JSON.stringify({
      success: true,
      data: { items, total: totalCount },
      meta: {
        method: 'google_lens_1688_combo',
        detected_query: detectedQuery,
        lens_matches: visualMatches.length,
        provider: 'otapi',
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in image search:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to search by image',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Upload base64 image to storage and return public URL
async function uploadToTempStorage(base64: string): Promise<string | null> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !serviceKey) {
      console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return null;
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const b = base64.slice(0, 20);
    const ext = b.startsWith('/9j/') ? 'jpg' : b.startsWith('iVBOR') ? 'png' : b.startsWith('UklGR') ? 'webp' : 'jpg';
    const mime = ext === 'jpg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : 'image/webp';
    const fileName = `img-search-${Date.now()}.${ext}`;

    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const { error } = await supabase.storage
      .from('image-search')
      .upload(fileName, bytes, { contentType: mime, upsert: true });

    if (error) {
      console.error('Storage upload error:', error.message);
      return null;
    }

    const { data: publicData } = supabase.storage
      .from('image-search')
      .getPublicUrl(fileName);

    console.log('Image uploaded, public URL:', publicData.publicUrl);
    return publicData.publicUrl;
  } catch (err) {
    console.error('Upload error:', err);
    return null;
  }
}
