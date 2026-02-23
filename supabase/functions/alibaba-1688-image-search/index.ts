import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ATP_BASE = 'https://api.icom.la/1688/api/call.php';

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

    const apiKey = Deno.env.get('ATP_1688_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ success: false, error: 'ATP_1688_API_KEY not configured' }), {
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

    console.log('Image URL for ATP search:', imgUrl.slice(0, 120));

    // Step 2: Call ATP item_search_img API
    const searchUrl = `${ATP_BASE}?api_key=${encodeURIComponent(apiKey)}&item_search_img&imgid=${encodeURIComponent(imgUrl)}&lang=zh-CN&page=${page}&page_size=${pageSize}`;

    console.log(`ATP image search page ${page}...`);
    const resp = await fetch(searchUrl);
    const rawText = await resp.text();
    let searchData: any;
    try {
      searchData = JSON.parse(rawText);
    } catch {
      console.error('Failed to parse ATP response');
      return new Response(JSON.stringify({ success: false, error: 'Invalid ATP response' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!resp.ok) {
      const errMsg = searchData?.error || `ATP error: ${resp.status}`;
      console.error('ATP error:', errMsg);
      return new Response(JSON.stringify({ success: false, error: errMsg }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check for API error in response
    if (searchData?.error) {
      console.error('ATP API error:', searchData.error);
      return new Response(JSON.stringify({ success: false, error: searchData.error }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawItems = searchData?.item?.items?.item || searchData?.items?.item || [];
    const total = searchData?.item?.items?.total_results || searchData?.items?.total_results || rawItems.length;
    console.log(`ATP page ${page}: ${rawItems.length} items, total: ${total}, took ${Date.now() - startTime}ms`);

    if (!rawItems.length) {
      return new Response(JSON.stringify({
        success: true,
        data: { items: [], total: 0 },
        meta: { method: 'atp_image', convertedImageUrl: imgUrl },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Map ATP items to Product1688 format
    const items = rawItems.map((item: any) => ({
      num_iid: parseInt(String(item.num_iid || '0'), 10) || 0,
      title: item.title || '',
      pic_url: item.pic_url || '',
      price: parseFloat(String(item.price || '0')) || 0,
      promotion_price: undefined,
      sales: parseInt(String(item.sales || '0'), 10) || undefined,
      detail_url: item.detail_url || `https://detail.1688.com/offer/${item.num_iid}.html`,
      location: item.area || '',
      vendor_name: item.seller_nick || '',
    }));

    console.log(`ATP image search complete: ${items.length} items in ${Date.now() - startTime}ms`);

    return new Response(JSON.stringify({
      success: true,
      data: { items, total },
      meta: { method: 'atp_image', page, pageSize, convertedImageUrl: imgUrl },
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
