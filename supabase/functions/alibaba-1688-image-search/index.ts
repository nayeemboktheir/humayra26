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
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const startTime = Date.now();

    // ── Try RapidAPI native 1688 image search first (Pailitao - most accurate) ──
    const rapidApiKey = Deno.env.get('RAPIDAPI_KEY');
    if (rapidApiKey) {
      try {
        let searchImageUrl = imageUrl || '';

        // If base64, upload to storage to get a public URL
        if (imageBase64 && !imageUrl) {
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
          const { error: uploadError } = await supabase.storage
            .from('temp-images')
            .upload(fileName, bytes, { contentType: mime, upsert: true });

          if (!uploadError) {
            const { data: pub } = supabase.storage.from('temp-images').getPublicUrl(fileName);
            searchImageUrl = pub.publicUrl;
            // Schedule cleanup
            setTimeout(async () => {
              try { await supabase.storage.from('temp-images').remove([fileName]); } catch {}
            }, 60000);
          }
        }

        if (searchImageUrl) {
          // ── Try 1688-datahub first (item_search_image_2) ──
          try {
            const imgParam = encodeURIComponent(searchImageUrl);
            const datahubUrl = `https://1688-datahub.p.rapidapi.com/item_search_image_2?imgUrl=${imgParam}&page=${page}&sort=default`;
            console.log('Trying 1688-datahub image search...');

            const dhResp = await fetch(datahubUrl, {
              method: 'GET',
              headers: {
                'x-rapidapi-host': '1688-datahub.p.rapidapi.com',
                'x-rapidapi-key': rapidApiKey,
              },
            });

            if (dhResp.ok) {
              const dhData = await dhResp.json();
              const rawItems = dhData?.result?.result || dhData?.result?.items || dhData?.items || [];
              const totalCount = dhData?.result?.total_results || dhData?.result?.real_total_results || rawItems.length;
              console.log(`1688-datahub: ${rawItems.length} items in ${Date.now() - startTime}ms`);

              if (rawItems.length > 0) {
                const items = rawItems.map((item: any) => ({
                  num_iid: parseInt(item?.num_iid || item?.item_id || item?.offerId || '0', 10) || 0,
                  title: item?.title || item?.subject || '',
                  pic_url: item?.pic_url || item?.image_url || item?.img || '',
                  price: parseFloat(item?.price || item?.original_price || '0') || 0,
                  sales: item?.sales || item?.sold || undefined,
                  detail_url: item?.detail_url || `https://detail.1688.com/offer/${item?.num_iid || 0}.html`,
                  location: item?.location || item?.province || '',
                  vendor_name: item?.vendor_name || item?.company_name || '',
                }));

                return new Response(JSON.stringify({
                  success: true,
                  data: { items, total: totalCount },
                  meta: { method: 'native_1688_datahub', provider: 'rapidapi' },
                }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
              }
            } else {
              console.warn(`1688-datahub failed (${dhResp.status}), trying 1688-product2...`);
            }
          } catch (e) {
            console.warn('1688-datahub attempt failed:', e);
          }

          // ── Fallback to 1688-product2 (Pailitao) ──
          try {
            const imgParam = encodeURIComponent(searchImageUrl);
            const apiUrl = `https://1688-product2.p.rapidapi.com/1688/search/image?img_url=${imgParam}&page=${page}&sort=default`;
            console.log('Trying native 1688 Pailitao via RapidAPI...');

            const resp = await fetch(apiUrl, {
              method: 'GET',
              headers: {
                'x-rapidapi-host': '1688-product2.p.rapidapi.com',
                'x-rapidapi-key': rapidApiKey,
              },
            });

            if (resp.ok) {
              const data = await resp.json();
              const rawItems = data?.data?.items || data?.items || data?.result?.items || [];
              const totalCount = data?.data?.total || data?.total || rawItems.length;
              console.log(`RapidAPI Pailitao: ${rawItems.length} items in ${Date.now() - startTime}ms`);

              if (rawItems.length > 0) {
                const items = rawItems.map((item: any) => ({
                  num_iid: parseInt(item?.item_id || item?.num_iid || item?.offerId || '0', 10) || 0,
                  title: item?.title || item?.subject || '',
                  pic_url: item?.pic_url || item?.image_url || item?.img || '',
                  price: parseFloat(item?.price || item?.original_price || '0') || 0,
                  sales: item?.sales || item?.sold || undefined,
                  detail_url: item?.detail_url || `https://detail.1688.com/offer/${item?.item_id || item?.num_iid || 0}.html`,
                  location: item?.location || item?.province || '',
                  vendor_name: item?.vendor_name || item?.company_name || '',
                }));

                return new Response(JSON.stringify({
                  success: true,
                  data: { items, total: totalCount },
                  meta: { method: 'native_1688_pailitao', provider: 'rapidapi' },
                }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
              }
            } else {
              console.warn(`RapidAPI Pailitao failed (${resp.status}), falling back to AI method.`);
            }
          } catch (e) {
            console.warn('RapidAPI Pailitao attempt failed:', e);
          }
        }
      } catch (e) {
        console.warn('RapidAPI attempt failed, falling back to AI method:', e);
      }
    }

    // ── Fallback: AI (Gemini) keyword detection + OTAPI text search ──
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      return new Response(JSON.stringify({ success: false, error: 'AI API key not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const otapiKey = Deno.env.get('OTCOMMERCE_API_KEY');
    if (!otapiKey) {
      return new Response(JSON.stringify({ success: false, error: '1688 API not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Prepare image for Gemini
    let imageContent: any;
    if (imageBase64) {
      const b = imageBase64.slice(0, 20);
      const mime = b.startsWith('/9j/') ? 'image/jpeg' : b.startsWith('iVBOR') ? 'image/png' : 'image/jpeg';
      imageContent = { type: 'image_url', image_url: { url: `data:${mime};base64,${imageBase64}` } };
    } else {
      imageContent = { type: 'image_url', image_url: { url: imageUrl } };
    }

    const hint = keyword ? `\nIMPORTANT - The user says this product is: "${keyword}". Use this as your primary guide.` : '';
    const aiPrompt = `You are an expert product sourcer on 1688.com (China's largest wholesale platform). Your job is to identify products from images and generate the perfect Chinese search query.

Study this image very carefully. Pay attention to:
- What EXACTLY is this product? (e.g. 筋膜枪 NOT 锤子, 蓝牙耳机 NOT 头戴式耳机)
- Its specific type/subcategory
- Notable features (wireless, portable, color, material)
- Its intended use (fitness, kitchen, office, etc.)
${hint}
Generate a precise Chinese (中文) search query (3-8 characters/words) for 1688.com. Use the exact product name Chinese buyers would search for.

Common mistakes to avoid:
- Massage guns (筋膜枪) are NOT hammers (锤子)
- Earbuds (蓝牙耳机) are NOT headphones (头戴式耳机)  
- Power banks (充电宝) are NOT batteries (电池)
- Smart watches (智能手表) are NOT regular watches (手表)

RULES:
- Output ONLY the Chinese search query
- No English, no quotes, no explanation, no punctuation
- Be maximally specific`;

    console.log('Calling Gemini 2.5-pro for product identification...');

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [{ role: 'user', content: [{ type: 'text', text: aiPrompt }, imageContent] }],
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
      return new Response(JSON.stringify({ success: false, error: 'AI identification failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiResp.json();
    let detectedQuery = (aiData?.choices?.[0]?.message?.content || '').trim().replace(/^["']|["']$/g, '').trim();

    if (!detectedQuery) {
      return new Response(JSON.stringify({ success: false, error: 'Could not identify the product.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    detectedQuery = detectedQuery.slice(0, 80);
    console.log('Detected query:', detectedQuery);

    // Search 1688 via OTAPI
    const framePosition = (page - 1) * pageSize;
    const xmlParams = `<SearchItemsParameters><ItemTitle>${escapeXml(detectedQuery)}</ItemTitle><Provider>Alibaba1688</Provider></SearchItemsParameters>`;
    const otapiUrl = `https://otapi.net/service-json/SearchItemsFrame?instanceKey=${encodeURIComponent(otapiKey)}&language=en&xmlParameters=${encodeURIComponent(xmlParams)}&framePosition=${framePosition}&frameSize=${pageSize}`;

    const searchResp = await fetch(otapiUrl, { method: 'GET', headers: { 'Accept': 'application/json' } });
    const searchData = await searchResp.json().catch(() => null);

    if (!searchResp.ok || (searchData?.ErrorCode && searchData.ErrorCode !== 'Ok' && searchData.ErrorCode !== 'None')) {
      console.error('OTAPI search failed:', searchData);
      return new Response(JSON.stringify({ success: false, error: searchData?.ErrorMessage || 'Failed to search 1688' }), {
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

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
