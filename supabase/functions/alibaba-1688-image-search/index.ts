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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Step 1: Upload base64 image to storage to get a public URL for OTAPI
    console.log('Image search: uploading image to get public URL...');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const b = imageBase64.slice(0, 20);
    const ext = b.startsWith('/9j/') ? 'jpg' : b.startsWith('iVBOR') ? 'png' : b.startsWith('UklGR') ? 'webp' : 'jpg';
    const mime = ext === 'jpg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : 'image/webp';

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
      return new Response(JSON.stringify({ success: false, error: 'Failed to upload image' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: publicUrlData } = supabase.storage.from('temp-images').getPublicUrl(fileName);
    const imageUrl = publicUrlData.publicUrl;
    console.log('Image uploaded, public URL:', imageUrl);

    // Step 2: Use OTAPI SearchItemsFrame with ImageUrl only
    // Do NOT include Provider — let OTAPI use native 1688 image search routing
    const framePosition = (page - 1) * pageSize;
    const xmlParams = `<SearchItemsParameters><ImageUrl>${imageUrl}</ImageUrl></SearchItemsParameters>`;
    const url = `https://otapi.net/service-json/SearchItemsFrame?instanceKey=${encodeURIComponent(apiKey)}&language=en&xmlParameters=${encodeURIComponent(xmlParams)}&framePosition=${framePosition}&frameSize=${pageSize}`;

    console.log('Calling OTAPI SearchItemsFrame with ImageUrl only (no Provider)...');
    const resp = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
    const data = await resp.json().catch(() => null);

    // Clean up temp image (fire and forget)
    supabase.storage.from('temp-images').remove([fileName]).catch(() => {});

    if (!resp.ok) {
      console.error('OTAPI error:', resp.status, data);
      return new Response(JSON.stringify({ success: false, error: data?.ErrorMessage || `Failed: ${resp.status}` }), {
        status: resp.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check for OTAPI-level errors
    if (data?.ErrorCode && data.ErrorCode !== 'Ok' && data.ErrorCode !== 'None') {
      console.error('OTAPI error code:', data.ErrorCode, data.ErrorMessage);
      return new Response(JSON.stringify({ success: false, error: data.ErrorMessage || data.ErrorCode }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const items = data?.Result?.Items?.Content || [];
    const searchMethod = data?.Result?.SearchMethod || 'unknown';
    console.log(`OTAPI image search returned ${items.length} items via method: ${searchMethod}`);

    return new Response(JSON.stringify({
      success: true,
      data,
      meta: { method: 'native_image_search', provider: 'otapi', searchMethod },
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