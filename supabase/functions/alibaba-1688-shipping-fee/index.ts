const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { itemId, province = '广东', quantity = 1 } = await req.json();

    if (!itemId) {
      return new Response(
        JSON.stringify({ success: false, error: 'itemId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiToken = Deno.env.get('TMAPI_TOKEN');
    if (!apiToken) {
      return new Response(
        JSON.stringify({ success: false, error: 'TMAPI not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching 1688 shipping fee for item:', itemId, 'province:', province);

    const url = `http://api.tmapi.top/1688/item/shipping?apiToken=${encodeURIComponent(apiToken)}&item_id=${encodeURIComponent(itemId)}&province=${encodeURIComponent(province)}&total_quantity=${quantity}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    const data = await response.json();

    if (!response.ok || data?.code !== 200) {
      console.error('TMAPI shipping fee error:', data);
      return new Response(
        JSON.stringify({ success: false, error: data?.msg || 'Failed to get shipping fee' }),
        { status: response.ok ? 400 : response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Shipping fee fetched successfully:', JSON.stringify(data?.data).substring(0, 200));

    return new Response(
      JSON.stringify({ success: true, data: data?.data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error getting shipping fee:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to get shipping fee';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
