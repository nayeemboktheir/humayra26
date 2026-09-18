import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// This endpoint had no cache at all: every product view paid a fresh ~2s TMAPI round trip
// for a figure that barely moves. search_cache is reused as the store rather than adding a
// table — the codebase already namespaces it by key prefix (`img:`, `img2:`), and a
// migration cannot be applied to the Lovable-managed project from this repo anyway.
const CACHE_TTL_HOURS = 12;

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

    // Quantity and weight change the quoted fee, so they are part of the key.
    const cacheKey = `ship:${itemId}:${String(province).toLowerCase()}:${requestedQuantity}:${hasValidWeight ? requestedWeight.toFixed(3) : 'nw'}`;
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const cutoff = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();
    const { data: cachedRow, error: cacheReadError } = await supabase
      .from('search_cache')
      .select('items')
      .eq('query_key', cacheKey)
      .eq('page', 1)
      .gte('updated_at', cutoff)
      .maybeSingle();
    if (cacheReadError) console.error('shipping cache read failed:', cacheReadError.message);
    if (cachedRow?.items) {
      return new Response(
        JSON.stringify({ success: true, data: cachedRow.items, cached: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
    const url = `https://api.tmapi.top/1688/item/shipping?${params.toString()}`;

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
      // Use the charge exactly as TMAPI reports it — no fixed floors or re-derivation.
      // total_fee is TMAPI's calculated fee for the given quantity/weight; only fall
      // back to the first/next-unit formula when TMAPI omits total_fee entirely.
      const chargeableAmount = unit === 'kg' && hasValidWeight ? requestedWeight : requestedQuantity;
      const formulaFee = firstFee + Math.max(0, Math.ceil((chargeableAmount - firstUnit) / nextUnit)) * rawNextFee;
      const totalFee = result?.total_fee ?? (firstFee > 0 ? formulaFee : null);
      // Some already-deployed clients treat `0` as missing and multiply the
      // first fee by quantity. Send a tiny positive value instead so flat-rate
      // products still calculate as a single local delivery charge.
      const nextUnitFee = result?.next_unit_fee === 0 ? 0.000001 : (result?.next_unit_fee ?? null);
      console.log('Shipping fee fetched:', JSON.stringify(result));

      const payload = {
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
      };

      // Only successful quotes are cached — a province TMAPI could not price should be
      // retried next time rather than remembered as unavailable for 12 hours.
      const writeCache = supabase.from('search_cache').upsert(
        { query_key: cacheKey, page: 1, total_results: 0, items: payload, translated: true },
        { onConflict: 'query_key,page' }
      ).then(
        ({ error }) => { if (error) console.error('shipping cache write failed:', error.message); },
        (err) => { console.error('shipping cache write threw:', err?.message ?? err); },
      );
      const waitUntil = (globalThis as any).EdgeRuntime?.waitUntil;
      if (typeof waitUntil === 'function') waitUntil.call((globalThis as any).EdgeRuntime, writeCache);
      else await writeCache;

      return new Response(
        JSON.stringify({ success: true, data: payload, cached: false }),
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
