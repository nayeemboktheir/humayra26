const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const apiToken = Deno.env.get('TMAPI_TOKEN') || '';
  const { vendorId = 'b2b-2519604867' } = await req.json().catch(() => ({}));
  const sellerId = vendorId.replace(/^b2b-/, '');
  const candidates = [
    `http://api.tmapi.top/1688/shop/items?apiToken=${apiToken}&member_id=${sellerId}&page=1&page_size=10`,
    `http://api.tmapi.top/1688/shop/info?apiToken=${apiToken}&member_id=${sellerId}`,
  ];
  const results: any[] = [];
  for (const url of candidates) {
    try {
      const r = await fetch(url);
      const text = await r.text();
      results.push({ url: url.replace(apiToken, 'TOKEN'), status: r.status, body: text.slice(0, 300) });
    } catch (e) { results.push({ url, error: String(e) }); }
  }
  return new Response(JSON.stringify({ results }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
