const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const TMAPI_BASE = 'http://api.tmapi.top/1688';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, imageUrl, page = 1, pageSize = 20 } = await req.json();

    if (!imageBase64 && !imageUrl) {
      return new Response(JSON.stringify({ success: false, error: 'Image is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiToken = Deno.env.get('TMAPI_TOKEN');
    if (!apiToken) {
      return new Response(JSON.stringify({ success: false, error: 'TMAPI_TOKEN not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const startTime = Date.now();
    let imgUrl = imageUrl || '';

    // If we already have an alicdn URL (pages 2+), skip conversion entirely
    const isAlreadyConverted = imgUrl && (imgUrl.includes('alicdn.com') || imgUrl.includes('aliyuncs.com'));

    if (!isAlreadyConverted) {
      // Convert image to Alibaba-compatible URL via TMAPI
      // For base64: create a data URI and let TMAPI convert it
      // For external URLs: use TMAPI convert endpoint
      const urlToConvert = imageBase64
        ? `data:image/jpeg;base64,${imageBase64}`
        : imgUrl;

      console.log('Converting image via TMAPI...');
      try {
        const convertResp = await fetch(
          `${TMAPI_BASE}/tools/image/convert_url?apiToken=${encodeURIComponent(apiToken)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: urlToConvert,
              search_api_endpoint: '/global/search/image',
            }),
          }
        );
        const convertData = await convertResp.json();
        console.log('Convert response time:', Date.now() - startTime, 'ms');

        if (convertData?.code === 200 && convertData?.data) {
          const d = convertData.data;
          const possibleUrl = d.image_url || d.img_url || d.url || (typeof d === 'string' ? d : '');
          if (possibleUrl) {
            imgUrl = possibleUrl;
            console.log('Converted URL:', imgUrl.slice(0, 100));
          }
        } else {
          console.warn('Convert failed:', JSON.stringify(convertData).slice(0, 200));
          // If conversion fails and we only have base64, we can't proceed
          if (!imgUrl) {
            return new Response(JSON.stringify({ success: false, error: 'Image conversion failed' }), {
              status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
      } catch (convErr) {
        console.warn('Convert error:', convErr);
        if (!imgUrl) {
          return new Response(JSON.stringify({ success: false, error: 'Image conversion failed' }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    } else {
      console.log('Using pre-converted alicdn URL, skipping conversion');
    }

    // Search via TMAPI image search (max page_size = 20)
    const effectivePageSize = Math.min(pageSize, 20);
    const searchUrl = `${TMAPI_BASE}/global/search/image?apiToken=${encodeURIComponent(apiToken)}&img_url=${encodeURIComponent(imgUrl)}&language=en&page=${page}&page_size=${effectivePageSize}&sort=default`;

    console.log(`TMAPI image search page ${page}...`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    let resp: Response;
    try {
      resp = await fetch(searchUrl, { signal: controller.signal });
    } catch (fetchErr: any) {
      clearTimeout(timeout);
      const isTimeout = fetchErr?.name === 'AbortError';
      return new Response(JSON.stringify({
        success: false,
        error: isTimeout ? 'Search timed out, please try again' : `Search failed: ${fetchErr?.message}`,
      }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    clearTimeout(timeout);

    const rawText = await resp.text();
    if (!rawText || rawText.length < 2) {
      return new Response(JSON.stringify({
        success: true, data: { items: [], total: 0 },
        meta: { method: 'tmapi_image', convertedImageUrl: imgUrl },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let searchData: any;
    try { searchData = JSON.parse(rawText); } catch {
      return new Response(JSON.stringify({
        success: true, data: { items: [], total: 0 },
        meta: { method: 'tmapi_image', convertedImageUrl: imgUrl, note: 'parse_error' },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (searchData?.code && searchData.code !== 200) {
      return new Response(JSON.stringify({
        success: false, error: searchData?.msg || searchData?.message || `API error: ${searchData.code}`,
      }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const resultData = searchData?.data || searchData;
    const rawItems = resultData?.items || resultData?.result || [];
    const total = resultData?.total || resultData?.total_count || rawItems.length;

    const items = rawItems.map((item: any) => ({
      num_iid: parseInt(String(item.offer_id || item.item_id || item.num_iid || '0'), 10) || 0,
      title: item.title || item.subject || '',
      pic_url: item.pic_url || item.image_url || item.img || '',
      price: parseFloat(String(item.price || item.original_price || '0')) || 0,
      promotion_price: item.promotion_price ? parseFloat(String(item.promotion_price)) : undefined,
      sales: parseInt(String(item.sales || item.monthly_sales || item.sold || '0'), 10) || undefined,
      detail_url: item.detail_url || item.product_url || `https://detail.1688.com/offer/${item.offer_id || item.item_id || item.num_iid}.html`,
      location: item.location || item.province || '',
      vendor_name: item.seller_nick || item.shop_name || item.supplier || '',
    }));

    console.log(`Done: ${items.length} items in ${Date.now() - startTime}ms`);

    return new Response(JSON.stringify({
      success: true,
      data: { items, total },
      meta: { method: 'tmapi_image', page, pageSize: effectivePageSize, convertedImageUrl: imgUrl },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error in image search:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to search by image',
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
