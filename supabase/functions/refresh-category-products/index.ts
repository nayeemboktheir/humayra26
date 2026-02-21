import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CATEGORIES = [
  "shoes", "bag", "jewelry", "beauty products", "men clothing",
  "women clothing", "baby items", "eyewear sunglasses", "office supplies",
  "seasonal products", "phone accessories", "sports fitness",
  "entertainment", "watches", "automobile accessories", "pet supplies",
  "outdoor travelling", "electronics gadgets", "kitchen gadgets",
  "tools home improvement", "school supplies",
];

const PRODUCTS_PER_CATEGORY = 50;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const otapiKey = Deno.env.get("OTCOMMERCE_API_KEY");

    if (!otapiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "OTCOMMERCE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Optional: only refresh specific categories
    let categoriesToRefresh = CATEGORIES;
    try {
      const body = await req.json();
      if (Array.isArray(body?.categories) && body.categories.length > 0) {
        categoriesToRefresh = body.categories;
      }
    } catch { /* no body, refresh all */ }

    console.log(`Refreshing ${categoriesToRefresh.length} categories...`);

    let totalProducts = 0;

    for (const query of categoriesToRefresh) {
      try {
        const xmlParams = `<SearchItemsParameters><ItemTitle>${query}</ItemTitle><Provider>Alibaba1688</Provider></SearchItemsParameters>`;
        const url = `https://otapi.net/service-json/SearchItemsFrame?instanceKey=${encodeURIComponent(otapiKey)}&language=en&xmlParameters=${encodeURIComponent(xmlParams)}&framePosition=0&frameSize=${PRODUCTS_PER_CATEGORY}`;

        const resp = await fetch(url, { headers: { Accept: "application/json" } });
        const data = await resp.json();

        if (data?.ErrorCode && data.ErrorCode !== "Ok") {
          console.error(`Error for "${query}":`, data.ErrorCode);
          continue;
        }

        const items = data?.Result?.Items?.Content || [];
        if (items.length === 0) {
          console.log(`No items for "${query}"`);
          continue;
        }

        // Build rows — titles already in English via language=en
        const rows = items.map((item: any) => {
          const externalId = item?.Id || "";
          const pics = Array.isArray(item?.Pictures) ? item.Pictures : [];
          const featuredValues = Array.isArray(item?.FeaturedValues) ? item.FeaturedValues : [];
          const totalSales = parseInt(
            featuredValues.find((v: any) => v?.Name === "TotalSales")?.Value || "0", 10
          ) || null;

          return {
            category_query: query,
            product_id: externalId,
            title: item?.Title || "",
            image_url: item?.MainPictureUrl || pics[0]?.Url || "",
            price: item?.Price?.OriginalPrice || 0,
            sales: totalSales,
            detail_url: item?.ExternalItemUrl || "",
            location: item?.Location?.State || item?.Location?.City || "",
            vendor_name: item?.VendorName || item?.VendorDisplayName || "",
            stock: item?.MasterQuantity || null,
            weight: item?.PhysicalParameters?.Weight || null,
            extra_images: pics.map((p: any) => p?.Url || p?.Large?.Url || "").filter(Boolean),
          };
        });

        // Deduplicate by product_id
        const seen = new Set<string>();
        const uniqueRows = rows.filter((r: any) => {
          if (seen.has(r.product_id)) return false;
          seen.add(r.product_id);
          return true;
        });

        // Delete old products for this category and insert new
        await supabase.from("category_products").delete().eq("category_query", query);
        const { error: insertError } = await supabase.from("category_products").insert(uniqueRows);
        if (insertError) {
          console.error(`Insert error for "${query}":`, insertError.message);
        } else {
          totalProducts += rows.length;
          console.log(`Cached ${rows.length} products for "${query}"`);
        }

        // Small delay to avoid rate limits
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        console.error(`Error processing "${query}":`, err);
      }
    }

    console.log(`Done! Total cached: ${totalProducts}`);
    return new Response(
      JSON.stringify({ success: true, totalProducts, categories: categoriesToRefresh.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error refreshing category products:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
