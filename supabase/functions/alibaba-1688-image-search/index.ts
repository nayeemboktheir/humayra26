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
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      return new Response(JSON.stringify({ success: false, error: 'AI API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const otapiKey = Deno.env.get('OTCOMMERCE_API_KEY');
    if (!otapiKey) {
      return new Response(JSON.stringify({ success: false, error: '1688 API not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 1: Prepare image content for Gemini
    let imageContent: any;
    if (imageBase64) {
      const b = imageBase64.slice(0, 20);
      const mime = b.startsWith('/9j/') ? 'image/jpeg' : b.startsWith('iVBOR') ? 'image/png' : b.startsWith('UklGR') ? 'image/webp' : 'image/jpeg';
      imageContent = { type: 'image_url', image_url: { url: `data:${mime};base64,${imageBase64}` } };
    } else {
      imageContent = { type: 'image_url', image_url: { url: imageUrl } };
    }

    // Step 2: Use Gemini to precisely identify the product in CHINESE for 1688 accuracy
    const hint = keyword ? `\nUser hint: "${keyword}".` : '';
    const aiPrompt = `You are a professional 1688.com sourcing agent with deep expertise in Chinese wholesale product terminology.

Analyze this product image carefully. Identify:
1. The exact product category (e.g. 连衣裙, 手机壳, 蓝牙耳机)
2. Key material/fabric if visible (e.g. 棉, 不锈钢, 硅胶)
3. Key style/feature descriptors (e.g. 复古, 大码, 无线)
4. Target use or audience if obvious (e.g. 女, 儿童, 户外)
${hint}
Now combine these into a single Chinese search query (3-8 words) that a Chinese wholesale buyer would type on 1688.com to find this EXACT product. Use precise 1688 product terminology, not generic descriptions.

RULES:
- Output ONLY the Chinese search query, nothing else
- No English, no quotes, no explanation
- Be specific: "女士真皮单肩包" is better than "包包"
- Include material/style keywords when they help narrow results`;

    console.log('Calling Gemini 2.5-flash for product identification...');
    const startTime = Date.now();

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{
          role: 'user',
          content: [{ type: 'text', text: aiPrompt }, imageContent],
        }],
      }),
    });

    console.log(`AI responded in ${Date.now() - startTime}ms, status: ${aiResp.status}`);

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error('Gemini failed:', aiResp.status, errText);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ success: false, error: 'AI rate limit reached. Please try again in a moment.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ success: false, error: 'AI credits exhausted. Please add credits.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ success: false, error: 'AI identification failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiResp.json();
    let detectedQuery = (aiData?.choices?.[0]?.message?.content || '').trim().replace(/^["']|["']$/g, '').trim();

    if (!detectedQuery) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Could not identify the product. Try adding a keyword hint.',
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    detectedQuery = detectedQuery.slice(0, 80);
    console.log('Detected query:', detectedQuery);

    // Step 3: Search 1688 via OTAPI with Chinese query for best results
    const framePosition = (page - 1) * pageSize;
    const xmlParams = `<SearchItemsParameters><ItemTitle>${escapeXml(detectedQuery)}</ItemTitle><Provider>Alibaba1688</Provider></SearchItemsParameters>`;
    const otapiUrl = `https://otapi.net/service-json/SearchItemsFrame?instanceKey=${encodeURIComponent(otapiKey)}&language=en&xmlParameters=${encodeURIComponent(xmlParams)}&framePosition=${framePosition}&frameSize=${pageSize}`;

    const searchResp = await fetch(otapiUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    const searchData = await searchResp.json().catch(() => null);

    if (!searchResp.ok || (searchData?.ErrorCode && searchData.ErrorCode !== 'Ok' && searchData.ErrorCode !== 'None')) {
      console.error('OTAPI search failed:', searchData);
      return new Response(JSON.stringify({
        success: false,
        error: searchData?.ErrorMessage || 'Failed to search 1688',
      }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawItems = searchData?.Result?.Items?.Content || [];
    const totalCount = searchData?.Result?.Items?.TotalCount || rawItems.length;
    console.log(`Found ${rawItems.length} items (total: ${totalCount}) in ${Date.now() - startTime}ms total`);

    const items = rawItems.map((item: any) => {
      const price = item?.Price?.OriginalPrice || item?.Price?.ConvertedPriceList?.Internal?.Price || 0;
      const picUrl = item?.MainPictureUrl || item?.Pictures?.[0]?.Url || '';
      const externalId = item?.Id || '';
      const numIid = parseInt(externalId.replace(/^abb-/, ''), 10) || 0;
      const featuredValues = Array.isArray(item?.FeaturedValues) ? item.FeaturedValues : [];
      const totalSales = parseInt(featuredValues.find((v: any) => v?.Name === 'TotalSales')?.Value || '0', 10) || undefined;
      const location = item?.Location?.State || item?.Location?.City || '';

      return {
        num_iid: numIid,
        title: item?.Title || '',
        pic_url: picUrl,
        price: typeof price === 'number' ? price : parseFloat(price) || 0,
        promotion_price: undefined,
        sales: totalSales,
        detail_url: item?.ExternalItemUrl || `https://detail.1688.com/offer/${numIid}.html`,
        location,
        vendor_name: item?.VendorName || item?.VendorDisplayName || '',
      };
    });

    return new Response(JSON.stringify({
      success: true,
      data: { items, total: totalCount },
      meta: {
        method: 'gemini_ai_1688_combo',
        detected_query: detectedQuery,
        provider: 'otapi',
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in image search:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to search by image',
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
