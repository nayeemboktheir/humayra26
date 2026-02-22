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

    const apiKey = Deno.env.get('ATP_1688_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ success: false, error: 'ATP_1688_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const startTime = Date.now();

    // Step 1: Get an Alibaba-compatible image URL
    let imgId = imageUrl || '';

    // If we have base64 and no imageUrl, upload via ATP upload_img first
    if (imageBase64 && !imageUrl) {
      console.log('Uploading base64 image via ATP upload_img...');
      const uploadUrl = `https://1688.laonet.online/index.php?route=api_tester/call&api_name=upload_img&key=${apiKey}`;
      const uploadResp = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `imgcode=${encodeURIComponent(imageBase64)}`,
      });
      const uploadData = await uploadResp.json();
      console.log('Upload response:', JSON.stringify(uploadData).slice(0, 300));

      if (uploadData?.result?.pic_url) {
        imgId = uploadData.result.pic_url;
      } else if (uploadData?.result?.url) {
        imgId = uploadData.result.url;
      } else {
        // Fallback: upload to temp bucket
        imgId = await uploadToTempBucket(imageBase64);
      }
    }

    console.log('Image URL for search:', imgId.slice(0, 120));

    // Step 2: Call ATP image search
    const url = `https://1688.laonet.online/index.php?route=api_tester/call&api_name=item_search_img&key=${apiKey}&imgid=${encodeURIComponent(imgId)}&page=${page}&page_size=${Math.min(pageSize, 50)}`;

    console.log('ATP image search request...');
    const resp = await fetch(url);
    const data = await resp.json();

    console.log('ATP response status:', resp.status);

    if (!resp.ok) {
      console.error('ATP error:', JSON.stringify(data).slice(0, 500));
      return new Response(JSON.stringify({ success: false, error: `ATP error: ${resp.status}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check for error in response
    if (data?.error) {
      console.error('ATP error response:', data.error);
      return new Response(JSON.stringify({ success: false, error: data.error }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawItems = data?.items?.item || [];
    const total = data?.items?.total_results || data?.items?.real_total_results || rawItems.length;

    if (!Array.isArray(rawItems) || !rawItems.length) {
      return new Response(JSON.stringify({ success: true, data: { items: [], total: 0 }, meta: { method: 'atp_image' } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Map items to Product1688 format
    const items = rawItems.map((item: any) => ({
      num_iid: parseInt(String(item.num_iid || '0'), 10) || 0,
      title: item.title || '',
      pic_url: item.pic_url || '',
      price: parseFloat(String(item.price || item.promotion_price || '0')) || 0,
      promotion_price: item.promotion_price ? parseFloat(String(item.promotion_price)) : undefined,
      sales: typeof item.sales === 'number' ? item.sales : (parseInt(String(item.sales || '0'), 10) || undefined),
      detail_url: item.detail_url || `https://detail.1688.com/offer/${item.num_iid}.html`,
      location: item.area || item.location || '',
      vendor_name: item.seller_nick || item.vendor_name || '',
    }));

    console.log(`ATP image search returned ${items.length}/${total} items in ${Date.now() - startTime}ms`);

    return new Response(JSON.stringify({
      success: true,
      data: { items, total },
      meta: { method: 'atp_image', page, pageSize },
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

// Fallback: Upload base64 image to temp bucket and return public URL
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
