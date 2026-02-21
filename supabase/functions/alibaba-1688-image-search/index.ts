import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function translateTitles(titles: string[], apiKey: string): Promise<string[]> {
  try {
    const textsToTranslate = titles.join('\n---SEPARATOR---\n');
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
            content: `Translate from Russian/Chinese to natural English for e-commerce. Each input separated by ---SEPARATOR---. Return ONLY translated texts separated by ---SEPARATOR---. No numbering, no quotes. Keep brand names and model numbers as-is. If already English, return unchanged.`
          },
          { role: 'user', content: textsToTranslate }
        ],
        max_tokens: 2000,
        temperature: 0.2,
      }),
    });

    if (!response.ok) return titles;

    const data = await response.json();
    const translatedText = data.choices?.[0]?.message?.content || '';
    const translations = translatedText.split('---SEPARATOR---').map((t: string) => t.trim());
    return translations.length === titles.length ? translations : titles;
  } catch {
    return titles;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, page = 1, pageSize = 40 } = await req.json();

    if (!imageBase64) {
      return new Response(JSON.stringify({ success: false, error: 'Image is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = (Deno.env.get('OTCOMMERCE_API_KEY') ?? '').trim();
    if (!apiKey) {
      return new Response(JSON.stringify({ success: false, error: '1688 API not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const lovableKey = (Deno.env.get('LOVABLE_API_KEY') ?? '').trim();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Step 1: Upload base64 image to storage to get a public URL for OTAPI
    console.log('Image search: uploading image to get public URL...');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const b = imageBase64.slice(0, 20);
    const ext = b.startsWith('/9j/') ? 'jpg' : b.startsWith('iVBOR') ? 'png' : b.startsWith('UklGR') ? 'webp' : 'jpg';
    const mime = ext === 'jpg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : 'image/webp';

    // Decode base64 to binary
    const binaryStr = atob(imageBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const fileName = `search-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('temp-images')
      .upload(fileName, bytes, { contentType: mime, upsert: true });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return new Response(JSON.stringify({ success: false, error: 'Failed to upload image' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: publicUrlData } = supabase.storage.from('temp-images').getPublicUrl(fileName);
    const imageUrl = publicUrlData.publicUrl;
    console.log('Image uploaded, public URL:', imageUrl);

    // Step 2: Use OTAPI native image search with ImageUrl parameter
    const framePosition = (page - 1) * pageSize;
    const xmlParams = `<SearchItemsParameters><Provider>Alibaba1688</Provider><ImageUrl>${imageUrl}</ImageUrl></SearchItemsParameters>`;
    const url = `https://otapi.net/service-json/SearchItemsFrame?instanceKey=${encodeURIComponent(apiKey)}&language=en&xmlParameters=${encodeURIComponent(xmlParams)}&framePosition=${framePosition}&frameSize=${pageSize}`;

    console.log('Calling OTAPI native image search...');
    const resp = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
    const data = await resp.json().catch(() => null);

    // Clean up temp image (fire and forget)
    supabase.storage.from('temp-images').remove([fileName]).catch(() => {});

    if (!resp.ok) {
      console.error('OTAPI error:', data);
      return new Response(JSON.stringify({ success: false, error: data?.ErrorMessage || `Failed: ${resp.status}` }), {
        status: resp.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check for OTAPI-level errors
    if (data?.ErrorCode && data.ErrorCode !== 'Ok' && data.ErrorCode !== 'None') {
      console.error('OTAPI error code:', data.ErrorCode, data.ErrorMessage);
      return new Response(JSON.stringify({ success: false, error: data.ErrorMessage || data.ErrorCode }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const items = data?.Result?.Items?.Content || [];
    console.log(`OTAPI native image search returned ${items.length} items`);

    // Translate titles in background before returning
    if (items.length > 0 && lovableKey) {
      const titles = items.map((item: any) => item?.Title || '');
      const translated = await translateTitles(titles, lovableKey);
      for (let i = 0; i < items.length; i++) {
        if (translated[i]) items[i].Title = translated[i];
      }
    }

    return new Response(JSON.stringify({
      success: true,
      data,
      meta: { method: 'native_image_search', provider: 'otapi' },
    }), {
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
