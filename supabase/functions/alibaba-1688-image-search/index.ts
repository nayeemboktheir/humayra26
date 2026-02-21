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
    const fileName = `search-${Date.now()}.${ext}`;

    // Decode base64 to binary
    const binaryStr = atob(imageBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // Step 1: Get upload URL from OTAPI's own file storage
    console.log('Step 1: Getting OTAPI file upload URL...');
    const uploadUrlResp = await fetch(
      `https://otapi.net/service-json/GetFileUploadUrl?instanceKey=${encodeURIComponent(apiKey)}&language=en&fileName=${encodeURIComponent(fileName)}&fileType=SearchByImage`,
      { method: 'GET', headers: { Accept: 'application/json' } }
    );
    const uploadUrlData = await uploadUrlResp.json().catch(() => null);
    
    if (!uploadUrlData || uploadUrlData.ErrorCode !== 'Ok' || !uploadUrlData.Result) {
      console.error('GetFileUploadUrl failed:', JSON.stringify(uploadUrlData));
      return new Response(JSON.stringify({ success: false, error: 'Failed to get upload URL from API' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fileId = uploadUrlData.Result.Id;
    const uploadUrl = uploadUrlData.Result.UploadUrl;
    console.log(`Got file ID: ${fileId}, upload URL: ${uploadUrl}`);

    // Step 2: Upload the image binary to OTAPI's upload URL
    console.log('Step 2: Uploading image to OTAPI servers...');
    const uploadResp = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': mime },
      body: bytes,
    });

    if (!uploadResp.ok) {
      const uploadErrText = await uploadResp.text().catch(() => '');
      console.error('Image upload to OTAPI failed:', uploadResp.status, uploadErrText);
      return new Response(JSON.stringify({ success: false, error: 'Failed to upload image to search server' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // Consume the response body
    await uploadResp.text().catch(() => '');
    console.log('Image uploaded to OTAPI successfully');

    // Step 3: Search using ImageFileId for accurate visual matching
    const framePosition = (page - 1) * pageSize;
    const xmlParams = `<SearchItemsParameters><ImageFileId>${fileId}</ImageFileId></SearchItemsParameters>`;
    const url = `https://otapi.net/service-json/SearchItemsFrame?instanceKey=${encodeURIComponent(apiKey)}&language=en&xmlParameters=${encodeURIComponent(xmlParams)}&framePosition=${framePosition}&frameSize=${pageSize}`;

    console.log('Step 3: Searching with ImageFileId...');
    const resp = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
    const data = await resp.json().catch(() => null);

    if (!resp.ok) {
      console.error('OTAPI search error:', resp.status, data);
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
      meta: { method: 'otapi_file_upload', provider: 'otapi', searchMethod, fileId },
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
