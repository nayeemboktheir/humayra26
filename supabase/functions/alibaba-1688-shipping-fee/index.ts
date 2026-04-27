const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { numIid, province = 'Guangdong', quantity, totalQuantity, totalWeight } = await req.json();

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

    const requestedQuantity = Math.max(1, Math.floor(Number(totalQuantity ?? quantity ?? 1) || 1));
    const requestedWeight = Number(totalWeight);
    const hasValidWeight = Number.isFinite(requestedWeight) && requestedWeight > 0;

    console.log('Fetching 1688 shipping fee via TMAPI for item:', itemId, 'province:', province, 'quantity:', requestedQuantity, 'weight:', hasValidWeight ? requestedWeight : 'none');

    const params = new URLSearchParams({
      apiToken,
      item_id: itemId,
      province,
      total_quantity: String(requestedQuantity),
    });
    if (hasValidWeight) {
      params.set('total_weight', requestedWeight.toFixed(3));
    }
    const url = `http://api.tmapi.top/1688/item/shipping?${params.toString()}`;

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
        // TMAPI often returns "Get data error" for unsupported provinces.
        // Return success with null data so the client can fall back to another province
        // without surfacing a 400/runtime error.
        console.warn('TMAPI shipping fee unavailable for province:', province, JSON.stringify(data));
        return new Response(
          JSON.stringify({
            success: true,
            data: null,
            warning: data?.msg || 'Shipping fee unavailable for this province',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const result = data?.data;
      const unit = result?.unit || 'kg';
      const firstUnit = Number(result?.first_unit ?? 1) || 1;
      const nextUnit = Number(result?.next_unit ?? firstUnit) || firstUnit;
      const firstFee = Number(result?.first_unit_fee ?? 0) || 0;
      const rawNextFee = Number(result?.next_unit_fee ?? 0) || 0;
      const chargeableAmount = unit === 'kg' && hasValidWeight ? requestedWeight : requestedQuantity;
      const calculatedTotalFee = firstFee + Math.max(0, Math.ceil((chargeableAmount - firstUnit) / nextUnit)) * rawNextFee;
      const totalFee = unit === 'kg' && hasValidWeight && firstFee > 0
        ? calculatedTotalFee
        : (result?.total_fee ?? null);
      // Some already-deployed clients treat `0` as missing and multiply the
      // first fee by quantity. Send a tiny positive value instead so flat-rate
      // products still calculate as a single local delivery charge.
      const nextUnitFee = result?.next_unit_fee === 0 ? 0.000001 : (result?.next_unit_fee ?? null);
      console.log('Shipping fee fetched:', JSON.stringify(result));

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            total_fee: totalFee,
            original_total_fee: result?.total_fee ?? null,
            first_unit: result?.first_unit ?? null,
            first_unit_fee: result?.first_unit_fee ?? null,
            next_unit: result?.next_unit ?? null,
            next_unit_fee: nextUnitFee,
            unit,
            shipping_to: result?.shipping_to || province,
            total_quantity: requestedQuantity,
            total_weight: hasValidWeight ? requestedWeight : (result?.total_weight ?? null),
            calculation_basis: unit === 'kg' && hasValidWeight ? 'weight' : 'api_total_fee',
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
