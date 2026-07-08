import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendMetaCapiEvent } from '../_shared/meta-capi.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const merchantId = Deno.env.get('PAYSTATION_MERCHANT_ID');
    const password = Deno.env.get('PAYSTATION_PASSWORD');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!merchantId || !password) {
      return new Response(
        JSON.stringify({ success: false, error: 'PayStation credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const {
      invoice_number,
      payment_amount,
      cust_name,
      cust_phone,
      cust_email,
      cust_address,
      callback_url,
      checkout_items,
      reference,
      meta_event_id,
      meta_browser_ids,
      content_ids,
      num_items,
      event_source_url,
    } = await req.json();

    if (!invoice_number || !payment_amount || !cust_name || !cust_phone || !cust_email || !callback_url) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PayStation expects form data
    const formData = new FormData();
    formData.append('merchantId', merchantId);
    formData.append('password', password);
    formData.append('invoice_number', invoice_number);
    formData.append('currency', 'BDT');
    formData.append('payment_amount', String(payment_amount));
    formData.append('pay_with_charge', '1');
    formData.append('cust_name', cust_name);
    formData.append('cust_phone', cust_phone);
    formData.append('cust_email', cust_email);
    formData.append('cust_address', cust_address || '');
    formData.append('callback_url', callback_url);
    formData.append('checkout_items', checkout_items || '');
    formData.append('reference', reference || '');

    console.log('Initiating PayStation payment for invoice:', invoice_number);

    const response = await fetch('https://api.paystation.com.bd/initiate-payment', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();
    console.log('PayStation response:', JSON.stringify(data));

    if (data.status_code === '200' && data.status === 'success') {
      if (supabaseUrl && serviceRoleKey && meta_event_id) {
        const admin = createClient(supabaseUrl, serviceRoleKey);
        const nameParts = String(cust_name || '').trim().split(/\s+/);
        await sendMetaCapiEvent(admin, req, {
          eventName: 'InitiateCheckout',
          eventId: meta_event_id,
          eventSourceUrl: event_source_url,
          value: Number(payment_amount || 0),
          currency: 'BDT',
          contentIds: Array.isArray(content_ids) ? content_ids.map(String) : [],
          numItems: Number(num_items || 0) || undefined,
          orderId: reference,
          email: cust_email,
          phone: cust_phone,
          firstName: nameParts[0],
          lastName: nameParts.slice(1).join(' '),
          fbp: meta_browser_ids?.fbp,
          fbc: meta_browser_ids?.fbc,
        });
      }

      return new Response(
        JSON.stringify({ success: true, payment_url: data.payment_url, invoice_number: data.invoice_number }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({ success: false, error: data.message || 'Payment initiation failed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('PayStation init error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
