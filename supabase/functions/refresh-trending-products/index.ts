import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TRENDING_QUERIES = [
  "best selling products",
  "popular stationery",
  "trending fashion accessories",
  "popular bags",
  "trending jewelry",
];

const MAX_PRODUCTS = 15;

async function translateSingle(text: string, apiKey: string): Promise<string> {
  if (!text?.trim()) return text;
  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          {
            role: 'system',
            content: 'Translate the following product title to natural English for e-commerce. Return ONLY the translated title, nothing else. Keep brand names, model numbers as-is. If already English, return unchanged.'
          },
          { role: 'user', content: text }
        ],
        max_tokens: 300,
        temperature: 0.1,
      }),
    });
    if (!response.ok) return text;
    const data = await response.json();
    const result = (data.choices?.[0]?.message?.content || '').trim();
    return result || text;
  } catch {
    return text;
  }
}

async function translateBatch(titles: string[], apiKey: string): Promise<string[]> {
  const results: string[] = new Array(titles.length);
  const PARALLEL = 4;
  for (let i = 0; i < titles.length; i += PARALLEL) {
    const batch = titles.slice(i, i + PARALLEL);
    const translated = await Promise.all(batch.map(t => translateSingle(t, apiKey)));
    for (let j = 0; j < translated.length; j++) {
      results[i + j] = translated[j];
    }
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const otapiKey = Deno.env.get("OTCOMMERCE_API_KEY");
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");

    if (!otapiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "OTCOMMERCE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    console.log("Refreshing trending products...");

    const allProducts: Array<{
      product_id: string;
      title: string;
      image_url: string;
      price: number;
      old_price: number | null;
      sold: number;
    }> = [];

    const seenIds = new Set<string>();

    for (const query of TRENDING_QUERIES) {
      if (allProducts.length >= MAX_PRODUCTS) break;

      try {
        const xmlParams = `<SearchItemsParameters><ItemTitle>${query}</ItemTitle><Provider>Alibaba1688</Provider><Order>SalesDesc</Order></SearchItemsParameters>`;
        const url = `https://otapi.net/service-json/SearchItemsFrame?instanceKey=${encodeURIComponent(otapiKey)}&language=en&xmlParameters=${encodeURIComponent(xmlParams)}&framePosition=0&frameSize=10`;

        const resp = await fetch(url, { headers: { Accept: "application/json" } });
        const data = await resp.json();

        if (data?.ErrorCode && data.ErrorCode !== "Ok") {
          console.error(`Search error for "${query}":`, data.ErrorCode);
          continue;
        }

        const items = data?.Result?.Items?.Content || [];

        for (const item of items) {
          if (allProducts.length >= MAX_PRODUCTS) break;

          const externalId = item?.Id || "";
          if (!externalId || seenIds.has(externalId)) continue;

          const picUrl = item?.MainPictureUrl || item?.Pictures?.[0]?.Url || "";
          if (!picUrl) continue;

          const price = item?.Price?.ConvertedPriceList?.Internal?.Price || 0;
          const featuredValues = Array.isArray(item?.FeaturedValues) ? item.FeaturedValues : [];
          const totalSales = parseInt(
            featuredValues.find((v: any) => v?.Name === "TotalSales")?.Value || "0",
            10
          ) || 0;

          seenIds.add(externalId);
          allProducts.push({
            product_id: externalId,
            title: item?.Title || "",
            image_url: picUrl,
            price: typeof price === "number" ? price : parseFloat(price) || 0,
            old_price: null,
            sold: totalSales,
          });
        }
      } catch (err) {
        console.error(`Error searching "${query}":`, err);
      }
    }

    if (allProducts.length === 0) {
      console.log("No products fetched, keeping existing trending products");
      return new Response(
        JSON.stringify({ success: true, message: "No new products found, kept existing" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Translate titles to English
    if (lovableKey) {
      console.log(`Translating ${allProducts.length} trending product titles...`);
      const titles = allProducts.map(p => p.title);
      const translated = await translateBatch(titles, lovableKey);
      for (let i = 0; i < allProducts.length; i++) {
        allProducts[i].title = translated[i];
      }
      console.log("Translation complete");
    } else {
      console.warn("LOVABLE_API_KEY not set, skipping translation");
    }

    // Replace all trending products atomically
    const { error: deleteError } = await supabase.from("trending_products").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (deleteError) {
      console.error("Error deleting old trending products:", deleteError);
    }

    const { error: insertError } = await supabase.from("trending_products").insert(allProducts);
    if (insertError) {
      console.error("Error inserting trending products:", insertError);
      return new Response(
        JSON.stringify({ success: false, error: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Successfully refreshed ${allProducts.length} trending products`);
    return new Response(
      JSON.stringify({ success: true, count: allProducts.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error refreshing trending products:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Failed to refresh" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
