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

    const tmapiToken = Deno.env.get('TMAPI_TOKEN');
    if (!tmapiToken) {
      return new Response(JSON.stringify({ success: false, error: 'TMAPI_TOKEN not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get a public URL for the image
    let publicImageUrl = imageUrl || '';
    if (imageBase64 && !imageUrl) {
      publicImageUrl = await uploadToTempBucket(imageBase64);
    }

    const startTime = Date.now();

    // TMAPI image search endpoint
    const searchUrl = `https://api.tmapi.top/1688/item_search_image?key=${tmapiToken}&imgid=${encodeURIComponent(publicImageUrl)}&page=${page}&page_size=${Math.min(pageSize, 20)}`;

    console.log('TMAPI image search request:', searchUrl.split('key=')[0] + 'key=***');

    const resp = await fetch(searchUrl);
    const data = await resp.json();

    console.log('TMAPI response status:', resp.status, 'keys:', JSON.stringify(Object.keys(data)).slice(0, 200));

    if (!resp.ok) {
      console.error('TMAPI error:', JSON.stringify(data).slice(0, 500));
      return new Response(JSON.stringify({ success: false, error: `TMAPI error: ${resp.status}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse TMAPI response
    const rawItems = data?.data?.items || data?.result?.items?.item || data?.result?.items || data?.items || [];
    const total = data?.data?.total || data?.result?.items?.real_total_results || rawItems.length;

    if (!Array.isArray(rawItems) || !rawItems.length) {
      console.warn('TMAPI: No items found. Response:', JSON.stringify(data).slice(0, 500));
      return new Response(JSON.stringify({ success: true, data: { items: [], total: 0 }, meta: { method: 'tmapi_image' } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`TMAPI: ${rawItems.length} items in ${Date.now() - startTime}ms`);

    const items = rawItems.map((item: any) => {
      const itemId = parseInt(String(item?.num_iid || item?.nid || '0'), 10) || 0;
      let picUrl = item?.pic_url || item?.pic || '';
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
        vendor_name: item?.seller_nick || item?.vendor_name || '',
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
