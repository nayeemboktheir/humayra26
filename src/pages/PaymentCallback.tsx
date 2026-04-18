import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PaymentCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "failed" | "canceled">("loading");
  const [orderNumber, setOrderNumber] = useState("");

  const paymentStatus = searchParams.get("status");
  const invoiceNumber = searchParams.get("invoice_number");
  const trxId = searchParams.get("trx_id");

  useEffect(() => {
    if (!invoiceNumber) {
      setStatus("failed");
      return;
    }

    if (paymentStatus === "Canceled") {
      setStatus("canceled");
      // Update order payment status
      supabase.functions.invoke("paystation-verify-payment", {
        body: { invoice_number: invoiceNumber },
      });
      return;
    }

    // Verify payment server-side with polling (PayStation may take a few seconds to settle)
    let cancelled = false;

    const fetchOrderNumber = async () => {
      const { data: order } = await supabase
        .from("orders")
        .select("order_number")
        .eq("payment_invoice", invoiceNumber)
        .maybeSingle();
      if (order && !cancelled) setOrderNumber(order.order_number);
    };

    const verify = async () => {
      const maxAttempts = 6;
      let lastStatus = "";

      for (let i = 0; i < maxAttempts; i++) {
        if (cancelled) return;
        try {
          const { data } = await supabase.functions.invoke("paystation-verify-payment", {
            body: { invoice_number: invoiceNumber },
          });
          lastStatus = data?.trx_status || "";

          if (lastStatus === "success") {
            if (!cancelled) setStatus("success");
            await fetchOrderNumber();
            return;
          }
          if (lastStatus === "failed" || lastStatus === "canceled") {
            if (!cancelled) setStatus(lastStatus === "canceled" ? "canceled" : "failed");
            await fetchOrderNumber();
            return;
          }
        } catch {
          // keep polling
        }
        // Wait 2s before next attempt (initiated/pending state)
        await new Promise((r) => setTimeout(r, 2000));
      }

      if (!cancelled) setStatus("failed");
      await fetchOrderNumber();
    };

    verify();

    return () => {
      cancelled = true;
    };
  }, [invoiceNumber, paymentStatus]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-6">
        {status === "loading" && (
          <>
            <Loader2 className="h-16 w-16 animate-spin text-primary mx-auto" />
            <h1 className="text-xl font-bold">পেমেন্ট যাচাই করা হচ্ছে...</h1>
            <p className="text-muted-foreground">অনুগ্রহ করে অপেক্ষা করুন।</p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle2 className="h-16 w-16 text-primary mx-auto" />
            <h1 className="text-xl font-bold text-primary">পেমেন্ট সফল হয়েছে!</h1>
            {orderNumber && (
              <p className="text-muted-foreground">
                অর্ডার নম্বর: <span className="font-semibold text-foreground">{orderNumber}</span>
              </p>
            )}
            {trxId && (
              <p className="text-sm text-muted-foreground">Transaction ID: {trxId}</p>
            )}
            <div className="flex gap-3 justify-center pt-4">
              <Button onClick={() => navigate("/dashboard/orders")}>আমার অর্ডার দেখুন</Button>
              <Button variant="outline" onClick={() => navigate("/")}>হোমে যান</Button>
            </div>
          </>
        )}

        {status === "failed" && (
          <>
            <XCircle className="h-16 w-16 text-destructive mx-auto" />
            <h1 className="text-xl font-bold text-destructive">পেমেন্ট ব্যর্থ হয়েছে</h1>
            <p className="text-muted-foreground">আপনার পেমেন্ট সম্পন্ন হয়নি। অনুগ্রহ করে আবার চেষ্টা করুন।</p>
            <div className="flex gap-3 justify-center pt-4">
              <Button onClick={() => navigate("/dashboard/orders")}>আমার অর্ডার</Button>
              <Button variant="outline" onClick={() => navigate("/")}>হোমে যান</Button>
            </div>
          </>
        )}

        {status === "canceled" && (
          <>
            <AlertTriangle className="h-16 w-16 text-accent mx-auto" />
            <h1 className="text-xl font-bold text-accent-foreground">পেমেন্ট বাতিল হয়েছে</h1>
            <p className="text-muted-foreground">আপনি পেমেন্ট বাতিল করেছেন।</p>
            <div className="flex gap-3 justify-center pt-4">
              <Button onClick={() => navigate("/")}>আবার কেনাকাটা করুন</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
