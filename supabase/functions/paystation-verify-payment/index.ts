import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    const { invoice_number } = await req.json();

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
      return new Response(
        JSON.stringify({ success: false, error: data.message || 'Verification failed', trx_status: 'failed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const trxStatus = (data.data?.trx_status || '').toLowerCase();
    const trxId = data.data?.trx_id || '';
    const paymentMethod = data.data?.payment_method || '';

    // Update order in database using service role
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (trxStatus === 'success') {
      // Fetch all orders tied to this invoice so we can detect partial vs full
      const { data: invoiceOrders } = await supabase
        .from('orders')
        .select('id, user_id, order_number, payment_amount, total_price, domestic_courier_charge, shipping_charges, commission')
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
      }
    } else if (trxStatus === 'failed') {
      await supabase
        .from('orders')
        .update({ payment_status: 'failed' })
        .eq('payment_invoice', invoice_number);
    }

    return new Response(
      JSON.stringify({
        success: true,
        trx_status: trxStatus,
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
