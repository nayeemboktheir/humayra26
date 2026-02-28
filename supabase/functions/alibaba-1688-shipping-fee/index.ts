const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { numIid, province = 'Guangdong' } = await req.json();

    if (!numIid) {
      return new Response(
        JSON.stringify({ success: false, error: 'Product ID (numIid) is required' }),
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

    // Strip abb- prefix if present
    const itemId = String(numIid).replace(/^abb-/, '');

    console.log('Fetching 1688 shipping fee via TMAPI for item:', itemId, 'province:', province);

    const url = `http://api.tmapi.top/1688/item/shipping?apiToken=${encodeURIComponent(apiToken)}&item_id=${encodeURIComponent(itemId)}&province=${encodeURIComponent(province)}&total_quantity=1`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const data = await response.json();

      if (!response.ok || data?.code !== 200) {
        console.error('TMAPI shipping fee error:', JSON.stringify(data));
        return new Response(
          JSON.stringify({ success: false, error: data?.msg || 'Failed to get shipping fee' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const result = data?.data;
      console.log('Shipping fee fetched:', JSON.stringify(result));

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            total_fee: result?.total_fee ?? null,
            first_unit_fee: result?.first_unit_fee ?? null,
            next_unit_fee: result?.next_unit_fee ?? null,
            unit: result?.unit || 'kg',
            shipping_to: result?.shipping_to || province,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (fetchErr: any) {
      clearTimeout(timeout);
      if (fetchErr.name === 'AbortError') {
        console.error('TMAPI request timed out');
        return new Response(
          JSON.stringify({ success: false, error: 'Request timed out' }),
          { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw fetchErr;
    }
  } catch (error) {
    console.error('Error getting shipping fee:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to get shipping fee';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
