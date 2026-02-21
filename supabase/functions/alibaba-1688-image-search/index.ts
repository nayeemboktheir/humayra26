const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, page = 1, pageSize = 40, keyword = '' } = await req.json();

    if (!imageBase64) {
      return new Response(JSON.stringify({ success: false, error: 'Image is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Try ATP API first (better accuracy), fall back to OTAPI
    const atpKey = (Deno.env.get('ATP_1688_API_KEY') ?? '').trim();

    if (atpKey) {
      console.log('Using ATP API for image search...');
      try {
        const result = await atpImageSearch(atpKey, imageBase64, page, pageSize);
        if (result) {
          const itemCount = result?.Result?.Items?.Content?.length || 0;
          console.log(`ATP image search returned ${itemCount} items`);
          return new Response(JSON.stringify({
            success: true,
            data: result,
            meta: { method: 'atp_native', provider: 'atp' },
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } catch (err) {
        console.error('ATP image search failed, falling back to OTAPI:', err);
      }
    }

    // Fallback: OTAPI with ImageFileId
    console.log('Using OTAPI fallback for image search...');
    const otapiKey = (Deno.env.get('OTCOMMERCE_API_KEY') ?? '').trim();
    if (!otapiKey) {
      return new Response(JSON.stringify({ success: false, error: '1688 API not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await otapiImageSearch(otapiKey, imageBase64, page, pageSize, keyword);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in image search:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed to search by image' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ATP API: Upload image then search by image
async function atpImageSearch(apiKey: string, imageBase64: string, page: number, pageSize: number) {
  // Try multiple known ATP base URLs
  const baseUrls = [
    'https://1688.atphosting24.com/index.php',
    'https://1688.laonet.online/index.php',
  ];

  // Step 1: Upload image to get Alibaba-hosted URL
  console.log('ATP Step 1: Uploading image...');
  let imgUrl = '';

  for (const baseUrl of baseUrls) {
    try {
      const uploadUrl = `${baseUrl}?route=api_tester/call&api_name=1688.upload_img&key=${encodeURIComponent(apiKey)}`;
      const uploadResp = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `imgcode=${encodeURIComponent(imageBase64)}`,
      });

      const uploadData = await uploadResp.json().catch(() => null);
      console.log(`ATP upload response from ${baseUrl}:`, JSON.stringify(uploadData)?.slice(0, 500));

      if (uploadData && uploadData.url) {
        imgUrl = uploadData.url.startsWith('//') ? `https:${uploadData.url}` : uploadData.url;
        console.log('ATP upload success, image URL:', imgUrl);

        // Step 2: Search by image URL
        const searchUrl = `${baseUrl}?route=api_tester/call&api_name=1688.item_search_img&key=${encodeURIComponent(apiKey)}&imgid=${encodeURIComponent(imgUrl)}&page=${page}&page_size=${pageSize}`;
        console.log('ATP Step 2: Searching...');

        const searchResp = await fetch(searchUrl, {
          method: 'GET',
          headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip', Connection: 'close' },
        });

        const searchData = await searchResp.json().catch(() => null);
        if (!searchData) continue;

        console.log('ATP search result keys:', Object.keys(searchData));

        // Parse ATP response
        const rawItems = searchData?.items?.item || searchData?.result?.item || [];
        if (!Array.isArray(rawItems) || rawItems.length === 0) {
          console.log('ATP returned no items from', baseUrl);
          continue;
        }

        const items = rawItems.map((item: any) => ({
          Id: `abb-${item.num_iid}`,
          Title: item.title || '',
          MainPictureUrl: item.pic_url?.startsWith('//') ? `https:${item.pic_url}` : (item.pic_url || ''),
          Price: { OriginalPrice: parseFloat(item.price) || 0 },
          ExternalItemUrl: item.detail_url || `https://detail.1688.com/offer/${item.num_iid}.html`,
          FeaturedValues: item.sales ? [{ Name: 'TotalSales', Value: String(item.sales) }] : [],
          VendorName: item.seller_nick || '',
          Location: { City: item.area || '' },
        }));

        return {
          Result: {
            Items: {
              Content: items,
              TotalCount: searchData?.total_results || searchData?.real_total_results || items.length,
            },
            SearchMethod: 'ATP_Image',
          },
        };
      }
    } catch (err) {
      console.error(`ATP base URL ${baseUrl} failed:`, err);
    }
  }

  console.log('ATP image search: no results from any endpoint');
  return null;
}

// OTAPI fallback with ImageFileId
async function otapiImageSearch(apiKey: string, imageBase64: string, page: number, pageSize: number, keyword: string) {
  // Detect file extension and mime type
  const b = imageBase64.slice(0, 20);
  const ext = b.startsWith('/9j/') ? 'jpg' : b.startsWith('iVBOR') ? 'png' : b.startsWith('UklGR') ? 'webp' : 'jpg';
  const mime = ext === 'jpg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : 'image/webp';
  const fileName = `search-${Date.now()}.${ext}`;

  // Decode base64 to binary
  const binaryStr = atob(imageBase64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  // Step 1: Get upload URL
  const uploadUrlResp = await fetch(
    `https://otapi.net/service-json/GetFileUploadUrl?instanceKey=${encodeURIComponent(apiKey)}&language=en&fileName=${encodeURIComponent(fileName)}&fileType=Image`,
    { method: 'GET', headers: { Accept: 'application/json' } }
  );
  const uploadUrlData = await uploadUrlResp.json().catch(() => null);

  if (!uploadUrlData || uploadUrlData.ErrorCode !== 'Ok' || !uploadUrlData.Result) {
    return { success: false, error: 'Failed to get upload URL from API' };
  }

  const fileId = uploadUrlData.Result.Id;
  const uploadUrl = uploadUrlData.Result.UploadUrl;

  // Step 2: Upload image binary
  const uploadResp = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': mime },
    body: bytes,
  });

  if (!uploadResp.ok) {
    return { success: false, error: 'Failed to upload image to search server' };
  }
  await uploadResp.text().catch(() => '');

  // Step 3: Search using SearchItemsFrame with ImageFileId
  const framePosition = (page - 1) * pageSize;
  const keywordTag = keyword ? `<ItemTitle>${keyword}</ItemTitle>` : '';
  const xmlParams = `<SearchItemsParameters><ImageFileId>${fileId}</ImageFileId>${keywordTag}</SearchItemsParameters>`;

  const url = `https://otapi.net/service-json/SearchItemsFrame?instanceKey=${encodeURIComponent(apiKey)}&language=en&xmlParameters=${encodeURIComponent(xmlParams)}&framePosition=${framePosition}&frameSize=${pageSize}`;

  const resp = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
  const data = await resp.json().catch(() => null);

  if (!resp.ok || (data?.ErrorCode && data.ErrorCode !== 'Ok' && data.ErrorCode !== 'None')) {
    return { success: false, error: data?.ErrorMessage || `Failed: ${resp.status}` };
  }

  const items = data?.Result?.Items?.Content || [];
  const searchMethod = data?.Result?.SearchMethod || 'unknown';
  console.log(`OTAPI image search returned ${items.length} items via method: ${searchMethod}`);

  // Re-rank results if keyword provided
  if (keyword && items.length > 0) {
    const ranked = rerankByKeyword(items, keyword);
    const rerankedData = {
      ...data,
      Result: {
        ...data?.Result,
        Items: {
          ...data?.Result?.Items,
          Content: ranked,
        },
      },
    };
    return {
      success: true,
      data: rerankedData,
      meta: { method: 'otapi_file_id_reranked', provider: 'otapi', searchMethod, fileId },
    };
  }

  return {
    success: true,
    data,
    meta: { method: 'otapi_file_id', provider: 'otapi', searchMethod, fileId },
  };
}

// Re-rank items by keyword relevance: items whose title matches the keyword score higher
function rerankByKeyword(items: any[], keyword: string): any[] {
  const kw = keyword.toLowerCase().trim();
  const kwWords = kw.split(/\s+/).filter(Boolean);

  const scored = items.map((item: any) => {
    const title = (item?.Title || '').toLowerCase();
    let score = 0;

    // Exact phrase match = highest
    if (title.includes(kw)) score += 100;

    // Individual word matches
    for (const w of kwWords) {
      if (title.includes(w)) score += 30;
    }

    return { item, score };
  });

  // Sort by score descending, keeping original order for ties
  scored.sort((a, b) => b.score - a.score);

  // Put matching items first, then the rest (don't remove non-matching — user still sees visual matches)
  return scored.map((s) => s.item);
}
