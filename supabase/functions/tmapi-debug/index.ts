const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const apiToken = Deno.env.get('TMAPI_TOKEN')!;
  const member = 'b2b-220072460977402f56';
  const paths = [
    `/1688/shop/info?apiToken=${apiToken}&seller_member_id=${member}`,
    `/1688/shop_detail?apiToken=${apiToken}&seller_member_id=${member}`,
    `/1688/shop/detail?apiToken=${apiToken}&seller_member_id=${member}`,
    `/1688/seller/info?apiToken=${apiToken}&seller_member_id=${member}`,
    `/1688/shop/items?apiToken=${apiToken}&seller_member_id=${member}&page=1`,
  ];
  const out: Record<string, unknown> = {};
  for (const p of paths) {
    try {
      const r = await fetch(`http://api.tmapi.top${p}`, { headers: { Accept: 'application/json' } });
      const t = await r.text();
      out[p.split('?')[0]] = t.slice(0, 900);
    } catch (e) {
      out[p.split('?')[0]] = String(e);
    }
  }
  return new Response(JSON.stringify(out, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
