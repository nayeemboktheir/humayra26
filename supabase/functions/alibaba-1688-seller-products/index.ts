const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { vendorId, page = 1, pageSize = 40 } = await req.json();

    if (!vendorId) {
      return new Response(
        JSON.stringify({ success: false, error: 'vendorId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('OTCOMMERCE_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'API not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const framePosition = (page - 1) * pageSize;
    const xmlParams = `<SearchItemsParameters><VendorId>${vendorId}</VendorId><Provider>Alibaba1688</Provider></SearchItemsParameters>`;
    const url = `https://otapi.net/service-json/SearchItemsFrame?instanceKey=${encodeURIComponent(apiKey)}&language=en&xmlParameters=${encodeURIComponent(xmlParams)}&framePosition=${framePosition}&frameSize=${pageSize}`;

    console.log(`Fetching seller products for vendor: ${vendorId}, page: ${page}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    const data = await response.json();

    if (!response.ok || (data?.ErrorCode && data.ErrorCode !== 'Ok' && data.ErrorCode !== 'None')) {
      const err = data?.ErrorMessage || data?.ErrorCode || `Request failed: ${response.status}`;
      console.error('OTAPI seller search error:', err);
      return new Response(
        JSON.stringify({ success: false, error: err }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const rawItems = data?.Result?.Items?.Content || [];
    const totalCount = data?.Result?.Items?.TotalCount || 0;

    const items = rawItems.map((item: any) => {
      const price = item?.Price?.OriginalPrice || 0;
      const picUrl = item?.MainPictureUrl || item?.Pictures?.[0]?.Url || '';
      const externalId = item?.Id || '';
      const numIid = parseInt(externalId.replace(/^abb-/, ''), 10) || 0;
      const featuredValues = Array.isArray(item?.FeaturedValues) ? item.FeaturedValues : [];
      const totalSales = parseInt(featuredValues.find((v: any) => v?.Name === 'TotalSales')?.Value || '0', 10) || undefined;
      const pics = Array.isArray(item?.Pictures) ? item.Pictures : [];

      return {
        num_iid: numIid,
        title: item?.Title || '',
        pic_url: picUrl,
        price: typeof price === 'number' ? price : parseFloat(price) || 0,
        sales: totalSales,
        detail_url: `/?product=${numIid}`,
        extra_images: pics.map((p: any) => p?.Url || p?.Large?.Url || '').filter(Boolean),
        vendor_name: item?.VendorName || item?.VendorDisplayName || '',
        stock: item?.MasterQuantity || undefined,
        weight: item?.PhysicalParameters?.Weight || undefined,
      };
    });

    // Also try to get vendor info from the first item
    const firstItem = rawItems[0];
    const vendorInfo = firstItem ? {
      name: firstItem?.VendorName || firstItem?.VendorDisplayName || '',
      score: firstItem?.VendorScore || 0,
      location: firstItem?.Location?.State || firstItem?.Location?.City || '',
    } : null;

    console.log(`Returned ${items.length} products for vendor ${vendorId}`);

    return new Response(
      JSON.stringify({
        success: true,
        data: { items, total: totalCount, vendorInfo },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error fetching seller products:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed to fetch seller products' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
