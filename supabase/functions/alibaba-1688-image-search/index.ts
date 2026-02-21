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

    const otapiKey = (Deno.env.get('OTCOMMERCE_API_KEY') ?? '').trim();
    if (!otapiKey) {
      return new Response(JSON.stringify({ success: false, error: '1688 API not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Run image search + optional text search in parallel
    const promises: Promise<any>[] = [otapiImageSearch(otapiKey, imageBase64, page, pageSize, keyword)];

    if (keyword.trim()) {
      promises.push(otapiTextSearch(otapiKey, keyword.trim(), page, pageSize));
    }

    const results = await Promise.all(promises);
    const imageResult = results[0];
    const textResult = keyword.trim() ? results[1] : null;

    // If we have both image and text results, merge them prioritizing text matches
    if (textResult?.success && imageResult?.success) {
      const merged = mergeResults(imageResult.data, textResult.data);
      return new Response(JSON.stringify({
        success: true,
        data: merged,
        meta: { method: 'otapi_merged', provider: 'otapi' },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fallback to whichever succeeded
    const finalResult = imageResult?.success ? imageResult : textResult;
    return new Response(JSON.stringify(finalResult || { success: false, error: 'Search failed' }), {
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

// Merge image search results with text search results, prioritizing text matches
function mergeResults(imageData: any, textData: any): any {
  const imageItems = imageData?.Result?.Items?.Content || [];
  const textItems = textData?.Result?.Items?.Content || [];

  // Use text items as primary (more relevant to keyword), dedupe image items
  const seenIds = new Set(textItems.map((i: any) => i?.Id));
  const uniqueImageItems = imageItems.filter((i: any) => !seenIds.has(i?.Id));

  // Text results first, then remaining image results
  const merged = [...textItems, ...uniqueImageItems];

  return {
    ...imageData,
    Result: {
      ...imageData?.Result,
      Items: {
        Content: merged,
        TotalCount: merged.length,
      },
      SearchMethod: 'Merged_Text_Image',
    },
  };
}

// OTAPI text search by keyword
async function otapiTextSearch(apiKey: string, keyword: string, page: number, pageSize: number) {
  try {
    const framePosition = (page - 1) * pageSize;
    const xmlParams = `<SearchItemsParameters><ItemTitle>${keyword}</ItemTitle></SearchItemsParameters>`;
    const url = `https://otapi.net/service-json/SearchItemsFrame?instanceKey=${encodeURIComponent(apiKey)}&language=en&xmlParameters=${encodeURIComponent(xmlParams)}&framePosition=${framePosition}&frameSize=${pageSize}`;

    const resp = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
    const data = await resp.json().catch(() => null);

    if (!resp.ok || (data?.ErrorCode && data.ErrorCode !== 'Ok' && data.ErrorCode !== 'None')) {
      console.error('Text search failed:', data?.ErrorMessage);
      return { success: false };
    }

    const items = data?.Result?.Items?.Content || [];
    console.log(`OTAPI text search returned ${items.length} items for keyword: ${keyword}`);
    return { success: true, data };
  } catch (err) {
    console.error('Text search error:', err);
    return { success: false };
  }
}

// OTAPI image search with ImageFileId
async function otapiImageSearch(apiKey: string, imageBase64: string, page: number, pageSize: number, keyword: string) {
  const b = imageBase64.slice(0, 20);
  const ext = b.startsWith('/9j/') ? 'jpg' : b.startsWith('iVBOR') ? 'png' : b.startsWith('UklGR') ? 'webp' : 'jpg';
  const mime = ext === 'jpg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : 'image/webp';
  const fileName = `search-${Date.now()}.${ext}`;

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
    return { success: false, error: 'Failed to get upload URL' };
  }

  const fileId = uploadUrlData.Result.Id;
  const uploadUrl = uploadUrlData.Result.UploadUrl;

  // Step 2: Upload image
  const uploadResp = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': mime },
    body: bytes,
  });

  if (!uploadResp.ok) {
    return { success: false, error: 'Failed to upload image' };
  }
  await uploadResp.text().catch(() => '');

  // Step 3: Search using ImageFileId
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
  console.log(`OTAPI image search returned ${items.length} items`);

  return { success: true, data };
}
