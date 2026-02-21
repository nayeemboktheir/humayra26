import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, imageUrl, page = 1, pageSize = 20, keyword = '' } = await req.json();

    if (!imageBase64 && !imageUrl) {
      return new Response(JSON.stringify({ success: false, error: 'Image is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const startTime = Date.now();
    const tmapiToken = Deno.env.get('TMAPI_TOKEN');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const otapiKey = Deno.env.get('OTCOMMERCE_API_KEY');

    // ── Get a public URL for the image ──
    let publicImageUrl = imageUrl || '';
    if (imageBase64 && !imageUrl) {
      publicImageUrl = await uploadToTempBucket(imageBase64);
    }

    // ── PRIMARY: TMAPI direct Pailitao visual search ──
    if (tmapiToken && publicImageUrl) {
      const result = await tryTmapi(publicImageUrl, page, pageSize, tmapiToken, startTime);
      if (result) {
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ── FALLBACK: Gemini AI identification → OTAPI text search ──
    if (!lovableApiKey || !otapiKey) {
      return new Response(JSON.stringify({ success: false, error: 'No search API configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const detectedQuery = await identifyWithGemini(imageBase64, imageUrl, keyword, lovableApiKey);
    console.log(`Gemini detected: "${detectedQuery}" in ${Date.now() - startTime}ms`);

    if (!detectedQuery) {
      return new Response(JSON.stringify({ success: false, error: 'Could not identify the product.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Search via OTAPI
    const framePosition = (page - 1) * pageSize;
    const xmlParams = `<SearchItemsParameters><ItemTitle>${escapeXml(detectedQuery)}</ItemTitle><Provider>Alibaba1688</Provider></SearchItemsParameters>`;
    const otapiUrl = `https://otapi.net/service-json/SearchItemsFrame?instanceKey=${encodeURIComponent(otapiKey)}&language=en&xmlParameters=${encodeURIComponent(xmlParams)}&framePosition=${framePosition}&frameSize=${pageSize}`;

    const searchResp = await fetch(otapiUrl, { method: 'GET', headers: { 'Accept': 'application/json' } });
    const searchData = await searchResp.json().catch(() => null);

    if (!searchResp.ok || (searchData?.ErrorCode && searchData.ErrorCode !== 'Ok' && searchData.ErrorCode !== 'None')) {
      return new Response(JSON.stringify({ success: false, error: searchData?.ErrorMessage || 'Failed to search 1688' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawItems = searchData?.Result?.Items?.Content || [];
    const totalCount = searchData?.Result?.Items?.TotalCount || rawItems.length;

    const items = rawItems.map((item: any) => {
      const price = item?.Price?.OriginalPrice || item?.Price?.ConvertedPriceList?.Internal?.Price || 0;
      const picUrl = item?.MainPictureUrl || item?.Pictures?.[0]?.Url || '';
      const externalId = item?.Id || '';
      const numIid = parseInt(externalId.replace(/^abb-/, ''), 10) || 0;
      const featuredValues = Array.isArray(item?.FeaturedValues) ? item.FeaturedValues : [];
      const totalSales = parseInt(featuredValues.find((v: any) => v?.Name === 'TotalSales')?.Value || '0', 10) || undefined;

      return {
        num_iid: numIid,
        title: item?.Title || '',
        pic_url: picUrl,
        price: typeof price === 'number' ? price : parseFloat(price) || 0,
        sales: totalSales,
        detail_url: item?.ExternalItemUrl || `https://detail.1688.com/offer/${numIid}.html`,
        location: item?.Location?.State || item?.Location?.City || '',
        vendor_name: item?.VendorName || item?.VendorDisplayName || '',
      };
    });

    return new Response(JSON.stringify({
      success: true,
      data: { items, total: totalCount },
      meta: { method: 'gemini_ai_1688_combo', detected_query: detectedQuery, provider: 'otapi' },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error in image search:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to search by image',
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

// ── Upload base64 image to temp bucket and return public URL ──
async function uploadToTempBucket(imageBase64: string): Promise<string> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const b = imageBase64.slice(0, 20);
  const ext = b.startsWith('/9j/') ? 'jpg' : b.startsWith('iVBOR') ? 'png' : 'jpg';
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
  const binaryStr = atob(imageBase64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

  const fileName = `search-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from('temp-images')
    .upload(fileName, bytes, { contentType: mime, upsert: true });

  if (error) throw new Error(`Image upload failed: ${error.message}`);

  const { data: pub } = supabase.storage.from('temp-images').getPublicUrl(fileName);

  // Cleanup after 60s
  setTimeout(async () => {
    try { await supabase.storage.from('temp-images').remove([fileName]); } catch {}
  }, 60000);

  return pub.publicUrl;
}

// ── TMAPI: Convert image URL → Search by image ──
async function tryTmapi(
  imageUrl: string,
  page: number,
  pageSize: number,
  apiToken: string,
  startTime: number,
): Promise<any | null> {
  try {
    // Step 1: Convert non-Ali image URL to Ali-compatible format
    console.log('TMAPI: Converting image URL...');
    const convertResp = await fetch(
      `http://api.tmapi.top/1688/tools/image/convert_url?apiToken=${encodeURIComponent(apiToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: imageUrl, search_api_endpoint: '/search/image' }),
      }
    );

    if (!convertResp.ok) {
      console.error(`TMAPI convert failed: ${convertResp.status}`);
      return null;
    }

    const convertData = await convertResp.json();
    const convertedUrl = convertData?.data?.img_url || convertData?.data?.url || '';
    if (!convertedUrl) {
      console.error('TMAPI: No converted URL returned', convertData);
      return null;
    }
    console.log(`TMAPI: Image converted in ${Date.now() - startTime}ms`);

    // Step 2: Visual search with converted image
    const searchUrl = `http://api.tmapi.top/1688/search/image?apiToken=${encodeURIComponent(apiToken)}&img_url=${encodeURIComponent(convertedUrl)}&page=${page}&page_size=${Math.min(pageSize, 20)}&sort=default`;

    const searchResp = await fetch(searchUrl, { method: 'GET' });
    if (!searchResp.ok) {
      console.error(`TMAPI search failed: ${searchResp.status}`);
      return null;
    }

    const searchData = await searchResp.json();
    const rawItems = searchData?.data?.items || [];
    const total = searchData?.data?.total || rawItems.length;

    if (!rawItems.length) {
      console.warn('TMAPI: No items found');
      return null;
    }

    console.log(`TMAPI: ${rawItems.length} items in ${Date.now() - startTime}ms`);

    const items = rawItems.map((item: any) => ({
      num_iid: parseInt(item?.num_iid || item?.item_id || item?.offerId || '0', 10) || 0,
      title: item?.title || item?.subject || '',
      pic_url: item?.pic_url || item?.image_url || item?.img || '',
      price: parseFloat(item?.price || item?.original_price || '0') || 0,
      sales: item?.sales || item?.sold || undefined,
      detail_url: item?.detail_url || `https://detail.1688.com/offer/${item?.num_iid || 0}.html`,
      location: item?.location || item?.province || '',
      vendor_name: item?.vendor_name || item?.company_name || item?.shopName || '',
    }));

    return {
      success: true,
      data: { items, total },
      meta: { method: 'tmapi_pailitao', provider: 'tmapi' },
    };
  } catch (e) {
    console.error('TMAPI error:', e);
    return null;
  }
}

// ── Gemini identification (fallback) ──
async function identifyWithGemini(
  imageBase64: string | undefined,
  imageUrl: string | undefined,
  keyword: string,
  apiKey: string,
): Promise<string | null> {
  let imageContent: any;
  if (imageBase64) {
    const b = imageBase64.slice(0, 20);
    const mime = b.startsWith('/9j/') ? 'image/jpeg' : b.startsWith('iVBOR') ? 'image/png' : 'image/jpeg';
    imageContent = { type: 'image_url', image_url: { url: `data:${mime};base64,${imageBase64}` } };
  } else {
    imageContent = { type: 'image_url', image_url: { url: imageUrl } };
  }

  const hint = keyword ? `\nThe user says this product is: "${keyword}". Use this as your primary guide.` : '';
  const aiPrompt = `Identify this product and output ONLY a precise Chinese (中文) search query (3-8 chars) for 1688.com wholesale search. Be specific: 筋膜枪 not 锤子, 蓝牙耳机 not 头戴式耳机.${hint}\nNo English, no quotes, no explanation.`;

  try {
    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [{ role: 'user', content: [{ type: 'text', text: aiPrompt }, imageContent] }],
        max_tokens: 50,
        temperature: 0.1,
      }),
    });

    if (!resp.ok) {
      console.error('Gemini failed:', resp.status);
      return null;
    }

    const data = await resp.json();
    const query = (data?.choices?.[0]?.message?.content || '').trim().replace(/^["']|["']$/g, '').trim().slice(0, 80);
    return query || null;
  } catch (e) {
    console.error('Gemini error:', e);
    return null;
  }
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
