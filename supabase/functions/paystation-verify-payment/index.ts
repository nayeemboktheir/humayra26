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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!merchantId || !supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const {
      invoice_number,
      meta_event_id,
      meta_browser_ids,
      event_source_url,
    } = await req.json();

    if (!invoice_number) {
      return new Response(
        JSON.stringify({ success: false, error: 'invoice_number is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify with PayStation
    const formData = new FormData();
    formData.append('invoice_number', invoice_number);

    const response = await fetch('https://api.paystation.com.bd/transaction-status', {
      method: 'POST',
      headers: { 'merchantId': merchantId },
      body: formData,
    });

    const data = await response.json();
    console.log('PayStation verify response:', JSON.stringify(data));

    if (data.status_code !== '200') {
      // Transient/unknown — let client keep polling instead of marking failed
      return new Response(
        JSON.stringify({ success: false, error: data.message || 'Verification pending', trx_status: 'pending' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const trxStatus = (data.data?.trx_status || '').toLowerCase();
    const trxId = data.data?.trx_id || '';
    const paymentMethod = data.data?.payment_method || '';

    // Update order in database using service role
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const isSuccess = trxStatus === 'success' || trxStatus === 'successful' || trxStatus === 'completed';
    const isFailed = trxStatus === 'failed' || trxStatus === 'failure';
    const isCanceled = trxStatus === 'canceled' || trxStatus === 'cancelled';

    if (isSuccess) {
      // Fetch all orders tied to this invoice so we can detect partial vs full
      const { data: invoiceOrders } = await supabase
        .from('orders')
        .select('id, user_id, order_number, payment_amount, total_price, domestic_courier_charge, shipping_charges, commission, product_1688_id, quantity')
        .eq('payment_invoice', invoice_number);

      const orders = invoiceOrders || [];
      const sumGrand = orders.reduce((s: number, o: any) =>
        s + Number(o.total_price || 0) + Number(o.domestic_courier_charge || 0) + Number(o.shipping_charges || 0) + Number(o.commission || 0), 0);
      const sumPayable = orders.reduce((s: number, o: any) => s + Number(o.payment_amount || 0), 0);

      // If the payable amount is less than the true grand total, this is a 70% deposit
      const isPartial = sumPayable > 0 && sumPayable < Math.round(sumGrand * 0.99);
      const newPaymentStatus = isPartial ? 'partial' : 'paid';

      const { error } = await supabase
        .from('orders')
        .update({
          payment_status: newPaymentStatus,
          payment_trx_id: trxId,
          payment_method: paymentMethod,
          status: 'pending',
        })
        .eq('payment_invoice', invoice_number);

      if (error) {
        console.error('DB update error:', error);
      }

      const firstOrder = orders[0];
      if (firstOrder) {
        await supabase.from('transactions').insert({
          user_id: firstOrder.user_id,
          amount: sumPayable,
          type: isPartial ? 'partial_payment' : 'payment',
          description: `${isPartial ? '70% deposit' : 'Full payment'} for invoice ${invoice_number} via ${paymentMethod}`,
          reference_id: trxId,
          status: 'completed',
        });

        await supabase.from('notifications').insert({
          user_id: firstOrder.user_id,
          title: isPartial ? 'Deposit Received' : 'Payment Successful',
          message: `Your ${isPartial ? '70% advance' : 'full'} payment of ৳${sumPayable} for invoice ${invoice_number} was successful.`,
          type: 'payment',
        });

        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, phone')
          .eq('user_id', firstOrder.user_id)
          .maybeSingle();

        const nameParts = String(profile?.full_name || '').trim().split(/\s+/);
        await sendMetaCapiEvent(supabase, req, {
          eventName: 'Purchase',
          eventId: meta_event_id || `purchase_${invoice_number}`,
          eventSourceUrl: event_source_url,
          value: sumPayable,
          currency: 'BDT',
          orderId: firstOrder.order_number,
          contentIds: orders.map((o: any) => o.product_1688_id).filter(Boolean).map(String),
          numItems: orders.reduce((sum: number, o: any) => sum + Number(o.quantity || 0), 0),
          phone: profile?.phone,
          firstName: nameParts[0],
          lastName: nameParts.slice(1).join(' '),
          fbp: meta_browser_ids?.fbp,
          fbc: meta_browser_ids?.fbc,
        });
      }
    } else if (isFailed || isCanceled) {
      await supabase
        .from('orders')
        .update({ payment_status: isCanceled ? 'canceled' : 'failed' })
        .eq('payment_invoice', invoice_number);
    }

    // Normalize trx_status for client
    const normalizedStatus = isSuccess ? 'success' : isFailed ? 'failed' : isCanceled ? 'canceled' : trxStatus;

    return new Response(
      JSON.stringify({
        success: true,
        trx_status: normalizedStatus,
        trx_id: trxId,
        payment_method: paymentMethod,
        payment_amount: data.data?.payment_amount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('PayStation verify error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
