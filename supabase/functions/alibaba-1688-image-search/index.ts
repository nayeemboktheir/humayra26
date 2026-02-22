import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, imageUrl, page = 1, pageSize = 50 } = await req.json();

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

    // Get a public URL for the image
    let publicImageUrl = imageUrl || '';
    if (imageBase64 && !imageUrl) {
      publicImageUrl = await uploadToTempBucket(imageBase64);
    }

    console.log('Image URL for search:', publicImageUrl.slice(0, 120));

    // Call TMAPI image search endpoint
    const url = `http://api.tmapi.top/1688/search/image?apiToken=${apiToken}&img_url=${encodeURIComponent(publicImageUrl)}&page=${page}&page_size=${Math.min(pageSize, 50)}&sort=default`;

    console.log('TMAPI image search request...');
    const resp = await fetch(url);
    const data = await resp.json();

    console.log('TMAPI response status:', resp.status);

    if (!resp.ok || data?.code !== 0) {
      console.error('TMAPI error:', JSON.stringify(data).slice(0, 500));
      return new Response(JSON.stringify({ success: false, error: data?.msg || `TMAPI error: ${resp.status}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawItems = data?.data?.item || data?.data?.items || [];
    const total = data?.data?.total_results || data?.data?.total || rawItems.length;

    if (!Array.isArray(rawItems) || !rawItems.length) {
      return new Response(JSON.stringify({ success: true, data: { items: [], total: 0 }, meta: { method: 'tmapi_image' } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Map items to Product1688 format
    const items = rawItems.map((item: any) => ({
      num_iid: parseInt(item.num_iid || item.offerId || '0', 10) || 0,
      title: item.title || item.subject || '',
      pic_url: item.pic_url || item.image?.imgUrl || '',
      price: parseFloat(item.price || item.priceInfo?.price || '0') || 0,
      promotion_price: item.promotion_price ? parseFloat(item.promotion_price) : undefined,
      sales: item.sales || item.monthSold || undefined,
      detail_url: item.detail_url || `https://detail.1688.com/offer/${item.num_iid || item.offerId}.html`,
      location: item.location || '',
      vendor_name: item.vendor_name || item.sellerName || '',
    }));

    console.log(`TMAPI image search returned ${items.length}/${total} items in ${Date.now() - startTime}ms`);

    return new Response(JSON.stringify({
      success: true,
      data: { items, total },
      meta: { method: 'tmapi_image', page, pageSize },
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
