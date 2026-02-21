import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RAPIDAPI_HOST = '1688-product2.p.rapidapi.com';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, imageUrl, page = 1, pageSize = 20, keyword = '', sort = 'default' } = await req.json();

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

    const headers = {
      'x-rapidapi-key': rapidApiKey,
      'x-rapidapi-host': RAPIDAPI_HOST,
      'Content-Type': 'application/json',
    };

    // Step 1: Get Ali-compatible image URL
    let aliImageUrl = imageUrl || '';

    if (!aliImageUrl && imageBase64) {
      // Upload to temp storage to get a public URL, then convert via TMAPI
      const publicUrl = await uploadToTempStorage(imageBase64);
      if (!publicUrl) {
        return new Response(JSON.stringify({ success: false, error: 'Failed to upload image' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Convert to Ali-compatible URL via TMAPI
      const convertResp = await fetch(`https://${RAPIDAPI_HOST}/1688/image-url-convert`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ url: publicUrl }),
      });

      const convertData = await convertResp.json().catch(() => null);
      console.log('Image URL conversion response:', JSON.stringify(convertData));

      if (!convertResp.ok || convertData?.code !== 200 || !convertData?.data?.image_url) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: convertData?.msg || 'Failed to convert image URL' 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      aliImageUrl = convertData.data.image_url;
      // If it's a relative path, prepend the base
      if (aliImageUrl.startsWith('/')) {
        aliImageUrl = `https://cbu01.alicdn.com${aliImageUrl}`;
      }
    }

    console.log('Using image URL for search:', aliImageUrl);

    // Step 2: Search by image using multilingual endpoint (returns English)
    const searchParams = new URLSearchParams({
      img_url: aliImageUrl,
      page: String(page),
      page_size: String(Math.min(pageSize, 20)),
      language: 'en',
      sort,
    });

    const searchResp = await fetch(
      `https://${RAPIDAPI_HOST}/1688/search/image?${searchParams.toString()}`,
      { method: 'GET', headers: { 'x-rapidapi-key': rapidApiKey, 'x-rapidapi-host': RAPIDAPI_HOST } }
    );

    const searchData = await searchResp.json().catch(() => null);

    if (!searchResp.ok || searchData?.code !== 200) {
      console.error('Image search failed:', searchData);
      return new Response(JSON.stringify({
        success: false,
        error: searchData?.msg || `Image search failed: ${searchResp.status}`,
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const items = searchData?.data?.item_list || [];
    const total = searchData?.data?.total_count || items.length;

    console.log(`TMAPI image search returned ${items.length} items (total: ${total})`);

    // Parse items into our standard format
    const parsedItems = items.map((item: any) => ({
      num_iid: item.item_id || 0,
      title: item.title || '',
      pic_url: item.pic_url || item.img_url || '',
      price: parseFloat(item.price || '0') || 0,
      promotion_price: item.promotion_price ? parseFloat(item.promotion_price) : undefined,
      sales: item.sales ? parseInt(item.sales, 10) : undefined,
      detail_url: item.detail_url || `https://detail.1688.com/offer/${item.item_id}.html`,
      location: item.province || '',
      vendor_name: item.seller_nick || '',
    }));

    return new Response(JSON.stringify({
      success: true,
      data: { items: parsedItems, total },
      meta: { method: 'tmapi_rapidapi', provider: 'tmapi' },
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

// Upload base64 image to Supabase storage and return public URL
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

    const { data, error } = await supabase.storage
      .from('image-search')
      .upload(fileName, bytes, {
        contentType: mime,
        upsert: true,
      });

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
