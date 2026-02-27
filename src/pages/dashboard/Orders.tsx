import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import EmptyState from "@/components/dashboard/EmptyState";
import OrderInvoice from "@/components/OrderInvoice";
import { Loader2, FileText } from "lucide-react";

const statusColor: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  processing: "bg-blue-100 text-blue-800",
  shipped: "bg-purple-100 text-purple-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

const Orders = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [invoiceOrder, setInvoiceOrder] = useState<any | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("orders").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
      .then(({ data }) => { setOrders(data || []); setLoading(false); });
  }, [user]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">My Orders</h1>
      {orders.length === 0 ? <EmptyState /> : (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Invoice</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono text-sm">{order.order_number}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {order.product_image && <img src={order.product_image} alt="" className="h-10 w-10 rounded object-cover" referrerPolicy="no-referrer" />}
                      <span className="line-clamp-2 text-sm">{order.product_name}</span>
                    </div>
                  </TableCell>
                  <TableCell>{order.quantity}</TableCell>
                  <TableCell>৳{Number(order.total_price).toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge className={statusColor[order.status] || ""}>{order.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(order.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setInvoiceOrder(order)}>
                      <FileText className="h-4 w-4 text-primary" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
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
