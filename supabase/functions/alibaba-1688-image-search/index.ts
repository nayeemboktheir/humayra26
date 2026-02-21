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
    const { imageBase64, page = 1, pageSize = 40 } = await req.json();

    if (!imageBase64) {
      return new Response(JSON.stringify({ success: false, error: 'Image is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = (Deno.env.get('OTCOMMERCE_API_KEY') ?? '').trim();
    if (!apiKey) {
      return new Response(JSON.stringify({ success: false, error: '1688 API not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Detect file extension and mime type
    const b = imageBase64.slice(0, 20);
    const ext = b.startsWith('/9j/') ? 'jpg' : b.startsWith('iVBOR') ? 'png' : b.startsWith('UklGR') ? 'webp' : 'jpg';
    const mime = ext === 'jpg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : 'image/webp';
    const fileName = `image-search-${Date.now()}.${ext}`;

    // Decode base64 to binary
    const binaryStr = atob(imageBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // Upload image to Supabase storage to get a public URL
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { error: uploadError } = await supabase.storage
      .from('image-search')
      .upload(fileName, bytes, { contentType: mime, upsert: true });

    if (uploadError) {
      console.error('Storage upload failed:', uploadError.message);
      return new Response(JSON.stringify({ success: false, error: 'Failed to upload image' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: publicUrlData } = supabase.storage.from('image-search').getPublicUrl(fileName);
    const imageUrl = publicUrlData.publicUrl;
    console.log('Image uploaded, public URL:', imageUrl);

    // Search using ImageUrl for accurate visual matching
    const framePosition = (page - 1) * pageSize;
    const xmlParams = `<SearchItemsParameters><Provider>Alibaba1688</Provider><ImageUrl>${imageUrl}</ImageUrl></SearchItemsParameters>`;
    console.log('Searching with ImageUrl');

    const url = `https://otapi.net/service-json/SearchItemsFrame?instanceKey=${encodeURIComponent(apiKey)}&language=en&xmlParameters=${encodeURIComponent(xmlParams)}&framePosition=${framePosition}&frameSize=${pageSize}`;

    const resp = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
    const data = await resp.json().catch(() => null);

    if (!resp.ok) {
      console.error('OTAPI search error:', resp.status, data);
      return new Response(JSON.stringify({ success: false, error: data?.ErrorMessage || `Failed: ${resp.status}` }), {
        status: resp.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (data?.ErrorCode && data.ErrorCode !== 'Ok' && data.ErrorCode !== 'None') {
      console.error('OTAPI error code:', data.ErrorCode, data.ErrorMessage);
      return new Response(JSON.stringify({ success: false, error: data.ErrorMessage || data.ErrorCode }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const items = data?.Result?.Items?.Content || [];
    const searchMethod = data?.Result?.SearchMethod || 'unknown';
    console.log(`Image search returned ${items.length} items via method: ${searchMethod}`);

    // Clean up uploaded file (fire and forget)
    supabase.storage.from('image-search').remove([fileName]).catch(() => {});

    return new Response(JSON.stringify({
      success: true,
      data,
      meta: { method: 'image_url', provider: 'otapi', searchMethod },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in image search:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed to search by image' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
