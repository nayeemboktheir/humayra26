// Probe TMAPI endpoints — temporary debug
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const apiToken = Deno.env.get('TMAPI_TOKEN')!;
  const kw = 'shoes';
  const itemId = '659534749285';
  const tests = [
    `http://api.tmapi.top/1688/search/keyword?apiToken=${apiToken}&keyword=${kw}&page=1&page_size=20`,
    `http://api.tmapi.top/1688/keyword/search?apiToken=${apiToken}&keyword=${kw}&page=1&page_size=20`,
    `http://api.tmapi.top/1688/item_search?apiToken=${apiToken}&q=${kw}&page=1`,
    `http://api.tmapi.top/1688/items?apiToken=${apiToken}&keyword=${kw}&page=1`,
    `http://api.tmapi.top/1688/global/search?apiToken=${apiToken}&keyword=${kw}&page=1&page_size=20`,
    `http://api.tmapi.top/1688/search?apiToken=${apiToken}&keyword=${kw}&page=1&page_size=20`,
    `http://api.tmapi.top/1688/global/search/keyword?apiToken=${apiToken}&keyword=${kw}&page=1&page_size=20&sort=default`,
    `http://api.tmapi.top/1688/item_get?apiToken=${apiToken}&num_iid=${itemId}`,
    `http://api.tmapi.top/1688/item/get?apiToken=${apiToken}&item_id=${itemId}`,
    `http://api.tmapi.top/1688/global/item/detail?apiToken=${apiToken}&item_id=${itemId}`,
    `http://api.tmapi.top/1688/item/info?apiToken=${apiToken}&item_id=${itemId}`,
    `http://api.tmapi.top/1688/global/item_get?apiToken=${apiToken}&item_id=${itemId}`,
    `http://api.tmapi.top/1688/item?apiToken=${apiToken}&item_id=${itemId}`,
    `http://api.tmapi.top/1688/product/detail?apiToken=${apiToken}&item_id=${itemId}`,
  ];
  const results: any[] = [];
  for (const url of tests) {
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 8000);
      const r = await fetch(url, { signal: c.signal });
      clearTimeout(t);
      const txt = await r.text();
      results.push({ url: url.replace(apiToken, 'TOKEN'), status: r.status, body: txt.slice(0, 300) });
    } catch (e: any) {
      results.push({ url: url.replace(apiToken, 'TOKEN'), error: e?.message });
    }
  }
  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
