const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const apiToken = Deno.env.get('TMAPI_TOKEN')!;
  const { item_id = '898515902140', province = 'Guangdong', total_weight = '0.04', total_quantity = '1' } =
    req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const urls = [
    `http://api.tmapi.top/1688/item/shipping?apiToken=${apiToken}&item_id=${item_id}&province=${province}&total_quantity=${total_quantity}&total_weight=${total_weight}`,
    `http://api.tmapi.top/1688/item_detail?apiToken=${apiToken}&item_id=${item_id}&language=en`,
  ];
  const out: any = {};
  for (const u of urls) {
    try {
      const r = await fetch(u);
      const j = await r.json();
      const key = u.includes('shipping') ? 'shipping' : 'detail';
      out[key] = key === 'detail'
        ? { delivery_info: j?.data?.delivery_info, freight: j?.data?.freight, shipping: j?.data?.shipping, keys: Object.keys(j?.data || {}) }
        : j;
    } catch (e) {
      out.error = String(e);
    }
  }
  return new Response(JSON.stringify(out), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
