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
    const { imageBase64, imageUrl, page = 1, pageSize = 20, keyword = '' } = await req.json();

    if (!imageBase64 && !imageUrl) {
      return new Response(JSON.stringify({ success: false, error: 'Image is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rapidApiKey = Deno.env.get('RAPIDAPI_KEY');
    if (!rapidApiKey) {
      return new Response(JSON.stringify({ success: false, error: 'RapidAPI key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const startTime = Date.now();

    // Step 1: Get a public image URL
    let searchImageUrl = imageUrl || '';

    if (imageBase64 && !imageUrl) {
      // Upload base64 to Supabase storage to get a public URL
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const b = imageBase64.slice(0, 20);
      const ext = b.startsWith('/9j/') ? 'jpg' : b.startsWith('iVBOR') ? 'png' : b.startsWith('UklGR') ? 'webp' : 'jpg';
      const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

      // Decode base64 to binary
      const binaryStr = atob(imageBase64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      const fileName = `search-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('temp-images')
        .upload(fileName, bytes, { contentType: mime, upsert: true });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        return new Response(JSON.stringify({ success: false, error: 'Failed to process image' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: publicUrlData } = supabase.storage.from('temp-images').getPublicUrl(fileName);
      searchImageUrl = publicUrlData.publicUrl;
      console.log(`Image uploaded in ${Date.now() - startTime}ms: ${searchImageUrl}`);

      // Schedule cleanup (non-blocking)
      setTimeout(async () => {
        try {
          await supabase.storage.from('temp-images').remove([fileName]);
        } catch { /* ignore */ }
      }, 60000);
    }

    // Step 2: Call native 1688 image search via RapidAPI (Pailitao)
    const sortParam = 'default';
    const imgParam = encodeURIComponent(searchImageUrl);
    const apiUrl = `https://1688-product2.p.rapidapi.com/1688/search/image?img_url=${imgParam}&page=${page}&sort=${sortParam}`;

    console.log(`Calling native 1688 image search (Pailitao) via RapidAPI...`);
    console.log(`Image URL: ${searchImageUrl}`);

    const searchResp = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': '1688-product2.p.rapidapi.com',
        'x-rapidapi-key': rapidApiKey,
      },
    });

    console.log(`RapidAPI responded in ${Date.now() - startTime}ms, status: ${searchResp.status}`);

    if (!searchResp.ok) {
      const errText = await searchResp.text();
      console.error('RapidAPI error:', searchResp.status, errText);
      return new Response(JSON.stringify({
        success: false,
        error: `Image search failed (status ${searchResp.status})`,
      }), {
        status: searchResp.status >= 500 ? 502 : searchResp.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const searchData = await searchResp.json();
    console.log('RapidAPI response keys:', Object.keys(searchData));

    // Parse the response - adapt to the actual API response format
    const rawItems = searchData?.data?.items || searchData?.items || searchData?.result?.items || [];
    const totalCount = searchData?.data?.total || searchData?.total || searchData?.result?.total || rawItems.length;

    console.log(`Found ${rawItems.length} items (total: ${totalCount}) in ${Date.now() - startTime}ms total`);

    const items = rawItems.map((item: any) => {
      const numIid = item?.item_id || item?.num_iid || item?.offerId || 0;
      const price = item?.price || item?.original_price || 0;
      const picUrl = item?.pic_url || item?.image_url || item?.img || '';
      const title = item?.title || item?.subject || '';
      const sales = item?.sales || item?.sold || item?.monthSold || undefined;
      const detailUrl = item?.detail_url || item?.offer_url || `https://detail.1688.com/offer/${numIid}.html`;

      return {
        num_iid: typeof numIid === 'string' ? parseInt(numIid, 10) || 0 : numIid,
        title,
        pic_url: picUrl,
        price: typeof price === 'number' ? price : parseFloat(price) || 0,
        promotion_price: item?.promotion_price || undefined,
        sales,
        detail_url: detailUrl,
        location: item?.location || item?.province || '',
        vendor_name: item?.vendor_name || item?.company_name || item?.sellerName || '',
      };
    });

    return new Response(JSON.stringify({
      success: true,
      data: { items, total: totalCount },
      meta: {
        method: 'native_1688_pailitao',
        provider: 'rapidapi_tmapi',
        imageUrl: searchImageUrl,
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
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
