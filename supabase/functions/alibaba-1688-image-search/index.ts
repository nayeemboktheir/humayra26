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
      return new Response(
        JSON.stringify({ success: false, error: 'Image is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = (Deno.env.get('ATP_1688_API_KEY') ?? '').trim();
    if (!apiKey) {
      console.error('ATP_1688_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: '1688 API not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Uploading image to 1688...');

    // Step 1: Upload image
    // Some providers ignore query params on POST or fail parsing x-www-form-urlencoded for large payloads.
    // Use multipart/form-data (FormData) so api_key + imgcode are reliably parsed.
    const uploadUrl = `https://api.icom.la/1688/api/call.php?api_key=${encodeURIComponent(apiKey)}&upload_img`;

    const form = new FormData();
    form.set('api_key', apiKey);
    form.set('upload_img', '1');
    form.set('imgcode', imageBase64);

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
      },
      body: form,
    });

    const uploadData = await uploadResponse.json();
    console.log('Upload response:', JSON.stringify(uploadData).substring(0, 500));

    if (!uploadResponse.ok || !uploadData?.item?.picUrl) {
      console.error('Image upload failed:', uploadData);
      return new Response(
        JSON.stringify({ success: false, error: uploadData?.error || 'Failed to upload image' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const imgid = uploadData.item.picUrl;
    console.log('Image uploaded, searching with imgid:', imgid);

    // Step 2: Search by image
    const searchUrl = `https://api.icom.la/1688/api/call.php?api_key=${apiKey}&item_search_img&imgid=${encodeURIComponent(imgid)}&page=${page}&page_size=${pageSize}`;
    
    const searchResponse = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    const searchData = await searchResponse.json();

    if (!searchResponse.ok) {
      console.error('Image search failed:', searchData);
      return new Response(
        JSON.stringify({ success: false, error: searchData.error || 'Image search failed' }),
        { status: searchResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Image search successful, items found:', searchData?.item?.items?.item?.length || 0);
    
    return new Response(
      JSON.stringify({ success: true, data: searchData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in image search:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to search by image';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
