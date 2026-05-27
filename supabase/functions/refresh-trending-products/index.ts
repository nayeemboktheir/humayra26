import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const TRENDING_QUERIES = ["best selling products", "popular stationery", "trending fashion accessories", "popular bags", "trending jewelry"];
const MAX_PRODUCTS = 15;
const MAX_CANDIDATES = 80;
const TMAPI_BASE = "http://api.tmapi.top/1688";

function normalizeImg(u: string): string {
  if (!u) return ""; if (u.startsWith("//")) return `https:${u}`; return u;
}

// Multilingual cross-border search returns English titles directly — no AI translation needed.


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiToken = Deno.env.get("TMAPI_TOKEN");
    if (!apiToken) return new Response(JSON.stringify({ success: false, error: "TMAPI_TOKEN not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const allProducts: any[] = [];
    const seenIds = new Set<string>();
    const shuffledQueries = [...TRENDING_QUERIES].sort(() => Math.random() - 0.5);
    for (const query of shuffledQueries) {
      if (allProducts.length >= MAX_CANDIDATES) break;
      try {
        const page = 1 + Math.floor(Math.random() * 5);
        const url = `${TMAPI_BASE}/global/search/items?apiToken=${encodeURIComponent(apiToken)}&keyword=${encodeURIComponent(query)}&language=en&page=${page}&page_size=20&sort=sales`;
        const resp = await fetch(url, { headers: { Accept: "application/json" } });
        const data = await resp.json();
        if (data?.code && data.code !== 200) continue;
        const items: any[] = data?.data?.items || [];
        for (const item of items) {
          if (allProducts.length >= MAX_CANDIDATES) break;
          const id = String(item?.item_id || "");
          if (!id || seenIds.has(id)) continue;
          const picUrl = normalizeImg(item?.img || "");
          if (!picUrl) continue;
          const price = parseFloat(String(item?.price_info?.sale_price || item?.price_info?.price || item?.price || "0")) || 0;
          const sold = item?.sale_info?.sale_quantity_int || item?.sale_info?.sale_quantity_90days || 0;
          seenIds.add(id);
          allProducts.push({ product_id: id, title: item?.title || item?.title_origin || "", image_url: picUrl, price, old_price: null, sold });
        }
      } catch {}
    }
    if (allProducts.length === 0) return new Response(JSON.stringify({ success: true, message: "No new products found, kept existing" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const selectedProducts = [...allProducts].sort(() => Math.random() - 0.5).slice(0, Math.min(MAX_PRODUCTS, allProducts.length));

    await supabase.from("trending_products").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    const { error: insertError } = await supabase.from("trending_products").insert(selectedProducts);
    if (insertError) return new Response(JSON.stringify({ success: false, error: insertError.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ success: true, count: selectedProducts.length, candidates: allProducts.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Failed to refresh" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
