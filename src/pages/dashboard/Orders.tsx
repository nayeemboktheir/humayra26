import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import EmptyState from "@/components/dashboard/EmptyState";
import OrderInvoice from "@/components/OrderInvoice";
import { Loader2, FileText, CreditCard } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const statusColor: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  processing: "bg-blue-100 text-blue-800",
  shipped: "bg-purple-100 text-purple-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

const paymentBadge = (ps?: string) => {
  if (ps === "paid" || ps === "completed") return { label: "Paid", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" };
  if (ps === "partial" || ps === "deposit" || ps === "partially_paid") return { label: "70% Deposit", cls: "bg-blue-100 text-blue-800 border-blue-200" };
  if (ps === "failed") return { label: "Failed", cls: "bg-red-100 text-red-800 border-red-200" };
  return { label: "Unpaid", cls: "bg-amber-100 text-amber-800 border-amber-200" };
};

const isPaidStatus = (ps?: string) => ps === "paid" || ps === "completed";
const isPartialStatus = (ps?: string) => ps === "partial" || ps === "deposit" || ps === "partially_paid";

const Orders = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [invoiceOrder, setInvoiceOrder] = useState<any | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("orders").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
      .then(({ data }) => { setOrders(data || []); setLoading(false); });
  }, [user]);

  const handlePay = async (order: any) => {
    if (!user) return;
    setPayingId(order.id);
    try {
      const grandTotal = Number(order.total_price || 0) + Number(order.domestic_courier_charge || 0);
      const alreadyPaid = isPartialStatus(order.payment_status) ? Number(order.payment_amount || 0) : 0;
      const payableAmount = Math.max(grandTotal - alreadyPaid, 1);

      const invoiceNumber = `PS-${Date.now()}`;
      const callbackUrl = `${window.location.origin}/payment/callback`;

      const { data: prof } = await supabase.from("profiles").select("full_name, phone").eq("user_id", user.id).maybeSingle();

      // Extract address from notes if present
      const addrMatch = /\[Address: ([^\]]+)\]/.exec(order.notes || "");
      const address = addrMatch?.[1] || "";

      const { error: updErr } = await supabase
        .from("orders")
        .update({ payment_invoice: invoiceNumber, payment_amount: payableAmount })
        .eq("id", order.id);
      if (updErr) throw updErr;

      const { data: psData, error: psError } = await supabase.functions.invoke("paystation-init-payment", {
        body: {
          invoice_number: invoiceNumber,
          payment_amount: payableAmount,
          cust_name: prof?.full_name || "Customer",
          cust_phone: prof?.phone || "01700000000",
          cust_email: user.email || "customer@example.com",
          cust_address: address,
          callback_url: callbackUrl,
          checkout_items: order.product_name,
          reference: invoiceNumber,
        },
      });

      if (psError || !psData?.success || !psData?.payment_url) {
        throw new Error(psData?.error || "পেমেন্ট শুরু করতে সমস্যা হয়েছে।");
      }

      window.location.href = psData.payment_url;
    } catch (e: any) {
      toast({ title: "Payment Error", description: e.message || "Unable to start payment", variant: "destructive" });
      setPayingId(null);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">My Orders</h1>
      {orders.length === 0 ? <EmptyState /> : (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[110px]">Order #</TableHead>
                <TableHead className="max-w-[280px]">Product</TableHead>
                <TableHead className="w-[60px]">Qty</TableHead>
                <TableHead className="w-[90px]">Total</TableHead>
                <TableHead className="w-[100px]">Payment</TableHead>
                <TableHead className="w-[100px]">Status</TableHead>
                <TableHead className="w-[100px]">Date</TableHead>
                <TableHead className="w-[180px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => {
                const pb = paymentBadge(order.payment_status);
                const paid = isPaidStatus(order.payment_status);
                const partial = isPartialStatus(order.payment_status);
                const grandTotal = Number(order.total_price || 0) + Number(order.domestic_courier_charge || 0);
                const due = partial ? Math.max(grandTotal - Number(order.payment_amount || 0), 0) : grandTotal;
                return (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-sm">{order.order_number}</TableCell>
                    <TableCell className="max-w-[280px]">
                      <div className="flex items-center gap-2">
                        {order.product_image && <img src={order.product_image} alt="" loading="lazy" decoding="async" className="h-10 w-10 rounded object-cover flex-shrink-0" referrerPolicy="no-referrer" />}
                        <span className="line-clamp-2 text-sm">{order.product_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>{order.quantity}</TableCell>
                    <TableCell>৳{Number(order.total_price).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge className={`${pb.cls} border text-[10px]`}>{pb.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColor[order.status] || ""}>{order.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(order.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        {!paid && order.status !== "cancelled" && (
                          <Button
                            size="sm"
                            className="h-8 gap-1"
                            disabled={payingId === order.id}
                            onClick={() => handlePay(order)}
                            title={partial ? `Pay remaining ৳${due.toLocaleString()}` : `Pay ৳${due.toLocaleString()}`}
                          >
                            {payingId === order.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CreditCard className="h-3.5 w-3.5" />
                            )}
                            <span className="text-xs whitespace-nowrap">Pay ৳{due.toLocaleString()}</span>
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setInvoiceOrder(order)} title="View invoice">
                          <FileText className="h-4 w-4 text-primary" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <OrderInvoice
        order={invoiceOrder}
        open={!!invoiceOrder}
        onOpenChange={(open) => { if (!open) setInvoiceOrder(null); }}
      />
    </div>
  );
};

export default Orders;
