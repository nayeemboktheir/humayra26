const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const apiToken = Deno.env.get('TMAPI_TOKEN')!;
  const member = 'b2b-220072460977402f56';
  const out: Record<string, unknown> = {};
  const r = await fetch(`http://api.tmapi.top/1688/shop/items?apiToken=${apiToken}&member_id=${member}&page=1`, { headers: { Accept: 'application/json' } });
  const j = await r.json();
  out['shop/items'] = { keys: Object.keys(j?.data || {}), shop_info: j?.data?.shop_info ?? null, base: j?.data?.base_info ?? null };

  const r2 = await fetch(`http://api.tmapi.top/1688/item_detail?apiToken=${apiToken}&item_id=587743908350&language=en`, { headers: { Accept: 'application/json' } });
  const j2 = await r2.json();
  out['item.sale_info'] = j2?.data?.sale_info ?? null;
  out['item.service_tags'] = j2?.data?.service_tags ?? null;
  out['item.sale_count'] = j2?.data?.sale_count ?? null;
  out['item.delivery_info'] = j2?.data?.delivery_info ?? null;
  return new Response(JSON.stringify(out, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
