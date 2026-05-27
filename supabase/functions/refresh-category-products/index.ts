import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CATEGORIES = [
  "shoes", "bag", "jewelry", "beauty products", "men clothing", "women clothing",
  "baby items", "eyewear sunglasses", "office supplies", "seasonal products",
  "phone accessories", "sports fitness", "entertainment", "watches",
  "automobile accessories", "pet supplies", "outdoor travelling",
  "electronics gadgets", "kitchen gadgets", "tools home improvement", "school supplies",
];

const PRODUCTS_PER_CATEGORY = 20; // TMAPI max page_size is 20
const TMAPI_BASE = "http://api.tmapi.top/1688";

function normalizeImg(u: string): string {
  if (!u) return "";
  if (u.startsWith("//")) return `https:${u}`;
  return u;
}

// Multilingual cross-border search returns English titles directly — no AI translation needed.


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiToken = Deno.env.get("TMAPI_TOKEN");
    if (!apiToken) {
      return new Response(JSON.stringify({ success: false, error: "TMAPI_TOKEN not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    let categoriesToRefresh = CATEGORIES;
    try {
      const body = await req.json();
      if (Array.isArray(body?.categories) && body.categories.length > 0) categoriesToRefresh = body.categories;
    } catch {}

    let totalProducts = 0;
    for (const query of categoriesToRefresh) {
      try {
        const url = `${TMAPI_BASE}/global/search/items?apiToken=${encodeURIComponent(apiToken)}&keyword=${encodeURIComponent(query)}&language=en&page=1&page_size=${PRODUCTS_PER_CATEGORY}&sort=default`;
        const resp = await fetch(url, { headers: { Accept: "application/json" } });
        const data = await resp.json();
        if (data?.code && data.code !== 200) continue;
        const items: any[] = data?.data?.items || [];
        if (items.length === 0) continue;

        const rows = items.map((item: any) => {
          const id = String(item?.item_id || "");
          const picUrl = normalizeImg(item?.img || "");
          const price = parseFloat(String(item?.price_info?.sale_price || item?.price_info?.price || item?.price || "0")) || 0;
          const sold = parseSold(item?.sale_info?.sale_quantity_int ?? item?.sale_info?.sale_quantity_90days);
          const areaFrom = Array.isArray(item?.delivery_info?.area_from)
            ? item.delivery_info.area_from.join(" ")
            : (item?.delivery_info?.location || "");
          return {
            category_query: query,
            product_id: id,
            title: item?.title || item?.title_origin || "",
            image_url: picUrl,
            price,
            sales: sold,
            detail_url: item?.product_url || "",
            location: areaFrom,
            vendor_name: item?.shop_info?.company_name || item?.shop_info?.shop_name || item?.shop_info?.login_id || item?.shop_info?.seller_login_id || "",
            stock: null,
            weight: null,
            extra_images: [picUrl].filter(Boolean),
          };
        });

        const seen = new Set<string>();
        const uniqueRows = rows.filter((r: any) => {
          if (!r.product_id || seen.has(r.product_id)) return false;
          seen.add(r.product_id); return true;
        });
        await supabase.from("category_products").delete().eq("category_query", query);
        const { error: insertError } = await supabase.from("category_products").insert(uniqueRows);
        if (!insertError) totalProducts += uniqueRows.length;
        await new Promise(r => setTimeout(r, 500));
      } catch {}
    }
    return new Response(JSON.stringify({ success: true, totalProducts, categories: categoriesToRefresh.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
