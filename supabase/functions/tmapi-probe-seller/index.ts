const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const apiToken = Deno.env.get('TMAPI_TOKEN') || '';
  const url = `http://api.tmapi.top/1688/item_get?apiToken=${apiToken}&item_id=623411225368`;
  const r = await fetch(url);
  const text = await r.text();
  return new Response(text.slice(0, 4000), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
