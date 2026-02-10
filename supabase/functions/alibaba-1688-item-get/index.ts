const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { numIid } = await req.json();

    if (!numIid) {
      return new Response(
        JSON.stringify({ success: false, error: 'Product ID (numIid) is required' }),
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

    console.log('Getting 1688 product details via OTAPI for:', numIid);

    // OTAPI uses ItemId format: "Alibaba1688-{numIid}" or just the raw ID
    const itemId = String(numIid).startsWith('Alibaba1688-') ? numIid : numIid;

    const url = `https://otapi.net/service-json/BatchGetItemFullInfo?instanceKey=${encodeURIComponent(apiKey)}&language=en&itemId=${encodeURIComponent(itemId)}`;

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

    if (data?.ErrorCode && data.ErrorCode !== 'Ok' && data.ErrorCode !== 'None') {
      console.error('OTAPI error response:', data);
      return new Response(
        JSON.stringify({ success: false, error: data.ErrorMessage || data.ErrorCode }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Product details fetched successfully');

    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error getting 1688 product:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to get product';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
