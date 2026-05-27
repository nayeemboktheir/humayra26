import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const TRENDING_QUERIES = ["best selling products","popular stationery","trending fashion accessories","popular bags","trending jewelry"];
const MAX_PRODUCTS = 15; const MAX_CANDIDATES = 80; const SOURCE_FRAME_SIZE = 20; const MAX_FRAME_POSITION = 120;
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const otapiKey = Deno.env.get("OTCOMMERCE_API_KEY");
    if (!otapiKey) return new Response(JSON.stringify({ success: false, error: "OTCOMMERCE_API_KEY not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const allProducts: any[] = []; const seenIds = new Set<string>();
    const shuffledQueries = [...TRENDING_QUERIES].sort(() => Math.random() - 0.5);
    for (const query of shuffledQueries) {
      if (allProducts.length >= MAX_CANDIDATES) break;
      try {
        const framePosition = Math.floor(Math.random() * (MAX_FRAME_POSITION / 10 + 1)) * 10;
        const xmlParams = `<SearchItemsParameters><ItemTitle>${query}</ItemTitle><Provider>Alibaba1688</Provider><Order>SalesDesc</Order></SearchItemsParameters>`;
        const url = `https://otapi.net/service-json/SearchItemsFrame?instanceKey=${encodeURIComponent(otapiKey)}&language=en&xmlParameters=${encodeURIComponent(xmlParams)}&framePosition=${framePosition}&frameSize=${SOURCE_FRAME_SIZE}`;
        const resp = await fetch(url, { headers: { Accept: "application/json" } });
        const data = await resp.json();
        if (data?.ErrorCode && data.ErrorCode !== "Ok") continue;
        const items = data?.Result?.Items?.Content || [];
        for (const item of items) {
          if (allProducts.length >= MAX_CANDIDATES) break;
          const externalId = item?.Id || "";
          if (!externalId || seenIds.has(externalId)) continue;
          const picUrl = item?.MainPictureUrl || item?.Pictures?.[0]?.Url || "";
          if (!picUrl) continue;
          const price = item?.Price?.ConvertedPriceList?.Internal?.Price || 0;
          const featuredValues = Array.isArray(item?.FeaturedValues) ? item.FeaturedValues : [];
          const totalSales = parseInt(featuredValues.find((v: any) => v?.Name === "TotalSales")?.Value || "0", 10) || 0;
          seenIds.add(externalId);
          allProducts.push({ product_id: externalId, title: item?.Title || "", image_url: picUrl, price: typeof price === "number" ? price : parseFloat(price) || 0, old_price: null, sold: totalSales });
        }
      } catch {}
    }
    if (allProducts.length === 0) return new Response(JSON.stringify({ success: true, message: "No new products found, kept existing" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const selectedProducts = [...allProducts].sort(() => Math.random() - 0.5).slice(0, Math.min(MAX_PRODUCTS, allProducts.length));
    await supabase.from("trending_products").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    const { error: insertError } = await supabase.from("trending_products").insert(selectedProducts);
    if (insertError) return new Response(JSON.stringify({ success: false, error: insertError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ success: true, count: selectedProducts.length, candidates: allProducts.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Failed to refresh" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
