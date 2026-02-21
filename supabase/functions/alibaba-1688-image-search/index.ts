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

    const startTime = Date.now();
    const rapidApiKey = Deno.env.get('RAPIDAPI_KEY');

    // ── Get a public URL for the image ──
    let publicImageUrl = imageUrl || '';
    if (imageBase64 && !imageUrl) {
      publicImageUrl = await uploadToTempBucket(imageBase64);
    }

    // ── RapidAPI "1688 Product" image search ──
    if (rapidApiKey && publicImageUrl) {
      const result = await tryRapidApiImageSearch(publicImageUrl, page, pageSize, rapidApiKey, startTime);
      if (result) {
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // No fallback — return error if RapidAPI failed
    return new Response(JSON.stringify({ success: false, error: 'Image search failed. Please try again.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in image search:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to search by image',
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

// ── Upload base64 image to temp bucket and return public URL ──
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

// ── RapidAPI "1688 Product" (TMAPI wrapper): image search ──
async function tryRapidApiImageSearch(
  imageUrl: string,
  page: number,
  pageSize: number,
  apiKey: string,
  startTime: number,
): Promise<any | null> {
  const host = '1688-product2.p.rapidapi.com';
  try {
    // Step 1: Convert image URL to Alibaba-compatible format
    console.log('RapidAPI 1688-product: Converting image URL...');
    const convertResp = await fetch(`https://${host}/1688/tools/image/convert_url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-rapidapi-host': host,
        'x-rapidapi-key': apiKey,
      },
      body: JSON.stringify({ url: imageUrl }),
    });

    if (!convertResp.ok) {
      const body = await convertResp.text();
      console.error(`Image convert failed: ${convertResp.status}`, body.slice(0, 300));
      return null;
    }

    const convertData = await convertResp.json();
    const convertedUrl = convertData?.data?.url || convertData?.data || '';
    if (!convertedUrl) {
      console.error('Image convert returned no URL:', JSON.stringify(convertData).slice(0, 300));
      return null;
    }
    console.log(`Image converted in ${Date.now() - startTime}ms`);

    // Step 2: Search by converted image URL
    const searchUrl = `https://${host}/1688/search/image?img_url=${encodeURIComponent(convertedUrl)}&page=${page}&page_size=${Math.min(pageSize, 20)}&sort=default`;
    const searchResp = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': host,
        'x-rapidapi-key': apiKey,
      },
    });

    if (!searchResp.ok) {
      const body = await searchResp.text();
      console.error(`Image search failed: ${searchResp.status}`, body.slice(0, 300));
      return null;
    }

    const data = await searchResp.json();
    const rawItems = data?.data?.items || [];
    const total = data?.data?.total_results || rawItems.length;

    if (!rawItems.length) {
      console.warn('RapidAPI 1688-product: No items found');
      return null;
    }

    console.log(`RapidAPI 1688-product: ${rawItems.length} items in ${Date.now() - startTime}ms`);

    const items = rawItems.map((item: any) => {
      const itemId = parseInt(String(item?.num_iid || item?.item_id || '0'), 10) || 0;
      let picUrl = item?.pic_url || item?.image || '';
      if (picUrl.startsWith('//')) picUrl = 'https:' + picUrl;
      const price = parseFloat(String(item?.price || item?.promotion_price || '0')) || 0;

      return {
        num_iid: itemId,
        title: item?.title || '',
        pic_url: picUrl,
        price,
        sales: item?.sales ? parseInt(String(item.sales), 10) : undefined,
        detail_url: item?.detail_url || `https://detail.1688.com/offer/${itemId}.html`,
        location: item?.area || item?.location || '',
        vendor_name: item?.seller_nick || '',
      };
    });

    return {
      success: true,
      data: { items, total },
      meta: { method: 'rapidapi_1688_product_image', provider: 'rapidapi_tmapi' },
    };
  } catch (e) {
    console.error('RapidAPI 1688-product error:', e);
    return null;
  }
}

