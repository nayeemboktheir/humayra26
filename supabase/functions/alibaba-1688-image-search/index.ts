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

    if (!rapidApiKey) {
      return new Response(JSON.stringify({ success: false, error: 'RAPIDAPI_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get a public URL for the image
    let publicImageUrl = imageUrl || '';
    if (imageBase64 && !imageUrl) {
      publicImageUrl = await uploadToTempBucket(imageBase64);
    }

    const result = await search1688DataHub(publicImageUrl, page, pageSize, rapidApiKey, startTime);
    if (result) {
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

// 1688 DataHub RapidAPI: image search
async function search1688DataHub(
  imageUrl: string,
  page: number,
  pageSize: number,
  apiKey: string,
  startTime: number,
): Promise<any | null> {
  const host = '1688-datahub.p.rapidapi.com';
  try {
    // Try endpoint #1 first, then #2
    const endpoints = [
      `https://${host}/item_search_image?imgid=${encodeURIComponent(imageUrl)}&page=${page}&page_size=${Math.min(pageSize, 20)}`,
      `https://${host}/item_search_image_2?imgUrl=${encodeURIComponent(imageUrl)}&page=${page}&sort=default`,
    ];

    let resp: Response | null = null;
    let data: any = null;

    for (const searchUrl of endpoints) {
      console.log(`1688 DataHub: Trying ${searchUrl.split('?')[0].split('/').pop()}...`);
      const r = await fetch(searchUrl, {
        method: 'GET',
        headers: {
          'x-rapidapi-host': host,
          'x-rapidapi-key': apiKey,
        },
      });

      if (r.ok) {
        resp = r;
        data = await r.json();
        break;
      }
      const body = await r.text();
      console.error(`Endpoint failed: ${r.status}`, body.slice(0, 300));
      return null;
    }

    if (!data) {
      console.error('All 1688 DataHub endpoints failed');
      return null;
    }

    console.log('1688 DataHub response keys:', JSON.stringify(Object.keys(data)).slice(0, 200));

    // Parse response — 1688 DataHub returns { result: { status: {...}, items: { item: [...] } } }
    const result = data?.result;
    const status = result?.status;
    
    if (status?.data === 'error') {
      console.error('1688 DataHub API error:', status?.msg?.['internal-error'] || JSON.stringify(status));
      return null;
    }

    const rawItems = result?.items?.item || result?.items || [];
    const total = result?.items?.real_total_results || result?.items?.total_results || rawItems.length;

    if (!Array.isArray(rawItems) || !rawItems.length) {
      console.warn('1688 DataHub: No items found');
      return null;
    }

    console.log(`1688 DataHub: ${rawItems.length} items in ${Date.now() - startTime}ms`);

    const items = rawItems.map((item: any) => {
      const itemId = parseInt(String(item?.num_iid || '0'), 10) || 0;
      let picUrl = item?.pic_url || '';
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
      meta: { method: 'rapidapi_1688_datahub_image', provider: '1688-datahub' },
    };
  } catch (e) {
    console.error('1688 DataHub error:', e);
    return null;
  }
}
