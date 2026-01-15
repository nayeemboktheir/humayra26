import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { texts } = await req.json();
    
    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No texts provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Batch translate all texts in one call for efficiency
    const textsToTranslate = texts.join('\n---SEPARATOR---\n');
    
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
            content: `You are a translator. Translate the following Chinese product titles to English. Keep translations concise and natural for e-commerce product names. 
            
Rules:
- Translate each title separated by ---SEPARATOR---
- Return ONLY the translated titles, separated by ---SEPARATOR---
- Keep brand names, model numbers, and measurements as-is
- Make titles sound natural in English
- Do not add any explanations or extra text`
          },
          {
            role: 'user',
            content: textsToTranslate
          }
        ],
        max_tokens: 2000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Translation failed', translations: texts }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const translatedText = data.choices?.[0]?.message?.content || '';
    const translations = translatedText.split('---SEPARATOR---').map((t: string) => t.trim());

    // If translation count doesn't match, return original texts
    if (translations.length !== texts.length) {
      console.log('Translation count mismatch, returning originals');
      return new Response(
        JSON.stringify({ translations: texts }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ translations }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error translating:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
