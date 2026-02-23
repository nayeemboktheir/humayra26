import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CACHE_TTL_HOURS = 12;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, page = 1, pageSize = 40, imageUrl } = await req.json();

    // Support either text query or image URL search
    if (!query && !imageUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'Search query or imageUrl is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isImageSearch = !!imageUrl && !query;
    const queryKey = isImageSearch ? `img:${imageUrl.trim().toLowerCase()}` : query.trim().toLowerCase();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check cache
    const cutoff = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();
    const { data: cached } = await supabase
      .from('search_cache')
      .select('items, total_results, updated_at')
      .eq('query_key', queryKey)
      .eq('page', page)
      .gte('updated_at', cutoff)
      .maybeSingle();

    if (cached) {
      console.log(`Cache HIT for "${queryKey}" page ${page}`);
      return new Response(
        JSON.stringify({
          success: true,
          data: { items: cached.items, total: cached.total_results },
          cached: true,
          translated: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Cache MISS — fetch from OTAPI with language=en (native translation)
    console.log(`Cache MISS for "${queryKey}" page ${page}, fetching from OTAPI`);

    const apiKey = Deno.env.get('OTCOMMERCE_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: '1688 API not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const framePosition = (page - 1) * pageSize;
    // XML-escape special characters to prevent ValidationError
    const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    let xmlParams: string;
    if (isImageSearch) {
      xmlParams = `<SearchItemsParameters><ImageUrl>${xmlEscape(imageUrl)}</ImageUrl><Provider>Alibaba1688</Provider></SearchItemsParameters>`;
      console.log(`OTAPI image search page ${page}, imageUrl: ${imageUrl.slice(0, 120)}`);
    } else {
      xmlParams = `<SearchItemsParameters><ItemTitle>${xmlEscape(query)}</ItemTitle><Provider>Alibaba1688</Provider></SearchItemsParameters>`;
    }
    const url = `https://otapi.net/service-json/SearchItemsFrame?instanceKey=${encodeURIComponent(apiKey)}&language=en&xmlParameters=${encodeURIComponent(xmlParams)}&framePosition=${framePosition}&frameSize=${pageSize}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    const data = await response.json();

    if (!response.ok || (data?.ErrorCode && data.ErrorCode !== 'Ok' && data.ErrorCode !== 'None')) {
      const err = data?.ErrorMessage || data?.ErrorCode || `Request failed: ${response.status}`;
      console.error('OTAPI error:', err);
      return new Response(
        JSON.stringify({ success: false, error: err }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const rawItems = data?.Result?.Items?.Content || [];
    const totalCount = data?.Result?.Items?.TotalCount || 0;

    // Parse items — already translated by OTAPI via language=en
    const items = rawItems.map((item: any) => {
      const price = item?.Price?.OriginalPrice || item?.Price?.ConvertedPriceList?.Internal?.Price || 0;
      const picUrl = item?.MainPictureUrl || item?.Pictures?.[0]?.Url || '';
      const externalId = item?.Id || '';
      const numIid = parseInt(externalId.replace(/^abb-/, ''), 10) || 0;
      const featuredValues = Array.isArray(item?.FeaturedValues) ? item.FeaturedValues : [];
      const totalSales = parseInt(featuredValues.find((v: any) => v?.Name === 'TotalSales')?.Value || '0', 10) || undefined;
      const pics = Array.isArray(item?.Pictures) ? item.Pictures : [];
      const location = item?.Location?.State || item?.Location?.City || '';

      return {
        num_iid: numIid,
        title: item?.Title || '',
        pic_url: picUrl,
        price: typeof price === 'number' ? price : parseFloat(price) || 0,
        sales: totalSales,
        detail_url: item?.ExternalItemUrl || `https://detail.1688.com/offer/${numIid}.html`,
        location,
        extra_images: pics.map((p: any) => p?.Url || p?.Large?.Url || '').filter(Boolean),
        vendor_name: item?.VendorName || item?.VendorDisplayName || '',
        stock: item?.MasterQuantity || undefined,
        weight: item?.PhysicalParameters?.Weight || undefined,
      };
    });

    console.log(`OTAPI returned ${items.length} items for "${queryKey}"`);

    // Store in cache (already translated by OTAPI)
    await supabase.from('search_cache').upsert(
      {
        query_key: queryKey,
        page,
        total_results: totalCount,
        items,
        translated: true,
      },
      { onConflict: 'query_key,page' }
    );

    return new Response(
      JSON.stringify({
        success: true,
        data: { items, total: totalCount },
        cached: false,
        translated: true,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in cached search:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Search failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
