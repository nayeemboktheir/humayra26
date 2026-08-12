import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import EmptyState from "@/components/dashboard/EmptyState";
import OrderInvoice from "@/components/OrderInvoice";
import { Loader2, FileText, CreditCard, Wallet, PackageCheck, Warehouse, ShieldCheck, PackageOpen, CheckCircle, LayoutGrid } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type CategoryKey = "all" | "to_pay" | "to_ship" | "rcv_cn_warehouse" | "bd_customs" | "rcv_bd_warehouse" | "delivered";

const CATEGORIES: { key: CategoryKey; label: string; icon: any }[] = [
  { key: "all", label: "All Orders", icon: LayoutGrid },
  { key: "to_pay", label: "To Pay", icon: Wallet },
  { key: "to_ship", label: "To Ship", icon: PackageCheck },
  { key: "rcv_cn_warehouse", label: "Rcv in CN Warehouse", icon: Warehouse },
  { key: "bd_customs", label: "BD Customs", icon: ShieldCheck },
  { key: "rcv_bd_warehouse", label: "Rcv in BD Warehouse", icon: PackageOpen },
  { key: "delivered", label: "Delivered", icon: CheckCircle },
];

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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [shipments, setShipments] = useState<Record<string, string>>({});
  const [category, setCategory] = useState<CategoryKey>("all");

  const stageOf = (o: any) => shipments[o.id] || o.status || "Ordered";

  const categoryOf = (o: any): CategoryKey | null => {
    if (o.status === "cancelled" || o.status === "refunded") return null;
    if (!isPaidStatus(o.payment_status)) return "to_pay";
    const st = stageOf(o);
    if (st === "Delivered" || o.status === "delivered" || o.status === "completed") return "delivered";
    if (st === "Out for Delivery") return "rcv_bd_warehouse";
    if (["Shipped to Bangladesh", "In Customs"].includes(st)) return "bd_customs";
    if (["Shipped to Warehouse", "Arrived at Warehouse"].includes(st)) return "rcv_cn_warehouse";
    return "to_ship";
  };

  const counts = CATEGORIES.reduce((acc, c) => {
    acc[c.key] = c.key === "all" ? orders.length : orders.filter((o) => categoryOf(o) === c.key).length;
    return acc;
  }, {} as Record<string, number>);

  const visibleOrders = category === "all" ? orders : orders.filter((o) => categoryOf(o) === category);


  const dueOf = (o: any) => {
    const grand = Number(o.total_price || 0) + Number(o.domestic_courier_charge || 0);
    return isPartialStatus(o.payment_status) ? Math.max(grand - Number(o.payment_amount || 0), 0) : grand;
  };
  const payableOrders = orders.filter((o) => !isPaidStatus(o.payment_status) && o.status !== "cancelled");
  const selectedOrders = payableOrders.filter((o) => selectedIds.includes(o.id));
  const selectedTotal = selectedOrders.reduce((s, o) => s + dueOf(o), 0);
  const allSelected = payableOrders.length > 0 && selectedIds.length === payableOrders.length;
  const toggleOrder = (id: string) =>
    setSelectedIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const toggleAll = () => setSelectedIds(allSelected ? [] : payableOrders.map((o) => o.id));

  const handlePayMany = async (list: any[]) => {
    if (!user || list.length === 0) return;
    setPayingId("bulk");
    try {
      const invoiceNumber = `PS-${Date.now()}`;
      const callbackUrl = `${window.location.origin}/payment/callback`;
      const { data: prof } = await supabase.from("profiles").select("full_name, phone").eq("user_id", user.id).maybeSingle();
      const addrMatch = /\[Address: ([^\]]+)\]/.exec(list[0].notes || "");

      let total = 0;
      for (const o of list) {
        const amount = Math.max(dueOf(o), 1);
        total += amount;
        const { error } = await supabase
          .from("orders")
          .update({ payment_invoice: invoiceNumber, payment_amount: amount })
          .eq("id", o.id);
        if (error) throw error;
      }

      const { data: psData, error: psError } = await supabase.functions.invoke("paystation-init-payment", {
        body: {
          invoice_number: invoiceNumber,
          payment_amount: total,
          cust_name: prof?.full_name || "Customer",
          cust_phone: prof?.phone || "01700000000",
          cust_email: user.email || "customer@example.com",
          cust_address: addrMatch?.[1] || "",
          callback_url: callbackUrl,
          checkout_items: list.map((o) => o.product_name).join(", "),
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

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: ord }, { data: ship }] = await Promise.all([
        supabase.from("orders").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
        supabase.from("shipments").select("order_id, status").eq("user_id", user.id),
      ]);
      setOrders(ord || []);
      const map: Record<string, string> = {};
      (ship || []).forEach((s: any) => { if (s.order_id) map[s.order_id] = s.status; });
      setShipments(map);
      setLoading(false);
    })();
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
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">My Orders</h1>
        {payableOrders.length > 0 && (
          <Button
            className="gap-2"
            disabled={selectedOrders.length === 0 || payingId === "bulk"}
            onClick={() => handlePayMany(selectedOrders)}
          >
            {payingId === "bulk" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            {selectedOrders.length === 0
              ? "অর্ডার সিলেক্ট করুন"
              : `${selectedOrders.length}টি অর্ডার একসাথে পে করুন (৳${selectedTotal.toLocaleString()})`}
          </Button>
        )}
      </div>

      {orders.length > 0 && (
        <div className="rounded-2xl border bg-card p-4 sm:p-5 mb-6 shadow-sm">
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 sm:gap-3">
            {CATEGORIES.map((c) => {
              const Icon = c.icon;
              const active = category === c.key;
              return (
                <button
                  key={c.key}
                  onClick={() => setCategory(c.key)}
                  className={`group flex flex-col items-center gap-2 rounded-xl px-2 py-3 transition-colors ${
                    active ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted"
                  }`}
                >
                  <span className="relative">
                    <Icon className={`h-7 w-7 ${active ? "text-primary" : "text-foreground/80"}`} strokeWidth={1.6} />
                    {counts[c.key] > 0 && (
                      <span className="absolute -top-2 -right-3 min-w-[20px] h-5 px-1 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold flex items-center justify-center">
                        {counts[c.key]}
                      </span>
                    )}
                  </span>
                  <span className={`text-[11px] sm:text-xs leading-tight text-center ${active ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                    {c.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {orders.length === 0 ? <EmptyState /> : visibleOrders.length === 0 ? (
        <div className="rounded-lg border py-16 text-center text-muted-foreground text-sm">
          এই ক্যাটাগরিতে কোনো অর্ডার নেই।
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" disabled={payableOrders.length === 0} />
                </TableHead>
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
              {visibleOrders.map((order) => {
                const pb = paymentBadge(order.payment_status);
                const paid = isPaidStatus(order.payment_status);
                const partial = isPartialStatus(order.payment_status);
                const grandTotal = Number(order.total_price || 0) + Number(order.domestic_courier_charge || 0);
                const due = partial ? Math.max(grandTotal - Number(order.payment_amount || 0), 0) : grandTotal;
                return (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(order.id)}
                        onCheckedChange={() => toggleOrder(order.id)}
                        disabled={paid || order.status === "cancelled"}
                        aria-label="Select order"
                      />
                    </TableCell>
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
                      <Badge className={statusColor[order.status] || "bg-muted text-foreground"}>{stageOf(order)}</Badge>
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
