const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const { itemId } = await req.json().catch(() => ({ itemId: '587743908350' }));
  const apiToken = Deno.env.get('TMAPI_TOKEN')!;
  const id = String(itemId || '587743908350');
  const url = `http://api.tmapi.top/1688/item_detail?apiToken=${encodeURIComponent(apiToken)}&item_id=${id}&language=en`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  const j = await r.json();
  return new Response(JSON.stringify({
    shop_info: j?.data?.shop_info ?? null,
    seller_keys: Object.keys(j?.data || {}),
  }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
