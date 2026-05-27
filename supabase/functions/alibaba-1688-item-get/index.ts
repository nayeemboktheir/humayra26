const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { numIid } = await req.json();
    if (!numIid) return new Response(JSON.stringify({ success: false, error: 'Product ID (numIid) is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const apiKey = Deno.env.get('OTCOMMERCE_API_KEY');
    if (!apiKey) return new Response(JSON.stringify({ success: false, error: '1688 API not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const itemId = String(numIid).startsWith('abb-') ? String(numIid) : `abb-${numIid}`;
    const url = `https://otapi.net/service-json/BatchGetItemFullInfo?instanceKey=${encodeURIComponent(apiKey)}&language=en&itemId=${encodeURIComponent(itemId)}&blockList=Description`;
    const response = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
    const data = await response.json();
    if (!response.ok) {
      const err = data?.ErrorDescription || data?.ErrorMessage || `Request failed: ${response.status}`;
      return new Response(JSON.stringify({ success: false, error: err }), { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (data?.ErrorCode && data.ErrorCode !== 'Ok') {
      const err = data?.ErrorDescription || data?.ErrorMessage || data.ErrorCode;
      return new Response(JSON.stringify({ success: false, error: err }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ success: true, data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed to get product' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
