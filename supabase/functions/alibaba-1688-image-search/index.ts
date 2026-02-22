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
    const { imageBase64, imageUrl, page = 1, pageSize = 50 } = await req.json();

    if (!imageBase64 && !imageUrl) {
      return new Response(JSON.stringify({ success: false, error: 'Image is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const appKey = Deno.env.get('ATP_1688_API_KEY');
    if (!appKey) {
      return new Response(JSON.stringify({ success: false, error: 'ATP_1688_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const startTime = Date.now();

    // Step 1: Get a public URL for the image
    let publicImageUrl = imageUrl || '';
    if (imageBase64 && !imageUrl) {
      publicImageUrl = await uploadToTempBucket(imageBase64);
    }

    console.log('Image URL for search:', publicImageUrl.slice(0, 120));

    // Step 2: Convert non-Alibaba image URLs via TMAPI (1688 API only accepts Alibaba-hosted images)
    let searchImgUrl = publicImageUrl;
    const needsConversion = !publicImageUrl.includes('alicdn.com') && !publicImageUrl.includes('1688.com');

    if (needsConversion) {
      const tmapiToken = Deno.env.get('TMAPI_TOKEN');
      if (tmapiToken) {
        searchImgUrl = await convertImageUrl(publicImageUrl, tmapiToken);
        console.log('Converted URL:', String(searchImgUrl).slice(0, 120));
      } else {
        console.warn('TMAPI_TOKEN not set, using original URL — may fail if not Alibaba-hosted');
      }
    }

    // Step 3: Call ATP 1688 image search
    const atpUrl = `https://gw.open.1688.com/openapi/param2/1/com.alibaba.search.image/${appKey}`;

    const formData = new URLSearchParams();
    formData.append('imageAddress', searchImgUrl);
    formData.append('beginPage', String(page));
    formData.append('pageSize', String(Math.min(pageSize, 50)));

    console.log('ATP image search request...');
    const resp = await fetch(atpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    const data = await resp.json();
    console.log('ATP response status:', resp.status, 'keys:', JSON.stringify(Object.keys(data)).slice(0, 200));

    if (!resp.ok) {
      console.error('ATP error:', JSON.stringify(data).slice(0, 500));
      return new Response(JSON.stringify({ success: false, error: `ATP error: ${resp.status}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ATP response: { items: { page, pagecount, page_size, total_results, item: [...] } }
    const itemsContainer = data?.items;
    const rawItems = itemsContainer?.item || [];
    const total = itemsContainer?.total_results || itemsContainer?.real_total_results || rawItems.length;

    if (!Array.isArray(rawItems) || !rawItems.length) {
      console.warn('ATP: No items found');
      return new Response(JSON.stringify({ success: true, data: { items: [], total: 0 }, meta: { method: 'atp_image' } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Map ATP items to Product1688 format
    const items = rawItems.map((item: any) => ({
      num_iid: item.num_iid || 0,
      title: item.title || '',
      pic_url: item.pic_url || '',
      price: parseFloat(item.price) || 0,
      promotion_price: parseFloat(item.promotion_price) || undefined,
      sales: item.sales || undefined,
      detail_url: item.detail_url || `https://detail.1688.com/offer/${item.num_iid}.html`,
      tag_percent: item.turn_head || undefined,
      location: item.location || '',
      vendor_name: item.vendor_name || '',
    }));

    console.log(`ATP image search returned ${items.length}/${total} items in ${Date.now() - startTime}ms`);

    return new Response(JSON.stringify({
      success: true,
      data: { items, total },
      meta: { method: 'atp_image', provider: 'atp', page: itemsContainer?.page, pagecount: itemsContainer?.pagecount },
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

// Convert non-Alibaba image URL via TMAPI
async function convertImageUrl(imageUrl: string, apiToken: string): Promise<string> {
  const convertUrl = `http://api.tmapi.top/1688/tools/image/convert_url?apiToken=${apiToken}`;
  console.log('Converting image URL via TMAPI...');

  const resp = await fetch(convertUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: imageUrl, search_api_endpoint: '/search/image' }),
  });

  const data = await resp.json();
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
