const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, page = 1, pageSize = 40 } = await req.json();

    if (!query) {
      return new Response(
        JSON.stringify({ success: false, error: 'Search query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('OTCOMMERCE_API_KEY');
    if (!apiKey) {
      console.error('OTCOMMERCE_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: '1688 API not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Searching 1688 via OTAPI for:', query);

    const framePosition = (page - 1) * pageSize;
    const xmlParams = `<SearchItemsParameters><ItemTitle>${query}</ItemTitle><Provider>Alibaba1688</Provider></SearchItemsParameters>`;

    const url = `https://otapi.net/service-json/SearchItemsFrame?instanceKey=${encodeURIComponent(apiKey)}&language=en&xmlParameters=${encodeURIComponent(xmlParams)}&framePosition=${framePosition}&frameSize=${pageSize}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('OTAPI error:', data);
      return new Response(
        JSON.stringify({ success: false, error: data?.ErrorMessage || `Request failed with status ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for OTAPI-level errors
    if (data?.ErrorCode && data.ErrorCode !== 'Ok' && data.ErrorCode !== 'None') {
      console.error('OTAPI error response:', data);
      return new Response(
        JSON.stringify({ success: false, error: data.ErrorMessage || data.ErrorCode }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const items = data?.Result?.Items?.Content || [];
    const totalCount = data?.Result?.Items?.TotalCount || 0;
    console.log('Search successful, items found:', items.length);

    return new Response(
      JSON.stringify({ success: true, data, meta: { provider: 'otapi', totalCount } }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error searching 1688:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to search';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
