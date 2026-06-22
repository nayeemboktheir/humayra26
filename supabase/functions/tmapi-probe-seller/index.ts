const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const apiToken = Deno.env.get('TMAPI_TOKEN') || '';
  const candidates = [
    `http://api.tmapi.top/1688/shop/items?apiToken=${apiToken}&member_id=b2b-2519604867&page=1&page_size=10`,
    `http://api.tmapi.top/1688/shop/items?apiToken=${apiToken}&member_id=%E8%BF%88%E5%90%95%E7%94%B5%E5%AD%90%E5%95%86%E5%8A%A1&page=1&page_size=10`,
    `http://api.tmapi.top/1688/shop/items?apiToken=${apiToken}&login_id=迈吕电子商务&page=1&page_size=10`,
  ];
  const results: any[] = [];
  for (const url of candidates) {
    const r = await fetch(url);
    const t = await r.text();
    results.push({ url: url.replace(apiToken, 'X'), status: r.status, body: t.slice(0, 500) });
  }
  return new Response(JSON.stringify(results, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
