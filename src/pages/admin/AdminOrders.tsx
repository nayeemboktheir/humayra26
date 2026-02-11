import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ExternalLink, UserCircle, Search, Trash2, Pencil, Package,
  Truck, DollarSign, Calendar, Hash, StickyNote, ImageIcon, Copy
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import ShipmentTimeline from "@/components/admin/ShipmentTimeline";

interface OrderWithProfile {
  id: string;
  order_number: string;
  product_name: string;
  product_image: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  status: string;
  tracking_number: string | null;
  product_url: string | null;
  source_url: string | null;
  notes: string | null;
  shipping_charges: number | null;
  commission: number | null;
  created_at: string;
  user_id: string;
  profile?: {
    full_name: string | null;
    phone: string | null;
    address: string | null;
    avatar_url: string | null;
  } | null;
}

const statusConfig: Record<string, { color: string; label: string }> = {
  pending: { color: "bg-amber-100 text-amber-800 border-amber-200", label: "Pending" },
  "Ordered": { color: "bg-amber-100 text-amber-800 border-amber-200", label: "Ordered" },
  "Purchased from 1688": { color: "bg-blue-100 text-blue-800 border-blue-200", label: "Purchased from 1688" },
  "Shipped to Warehouse": { color: "bg-indigo-100 text-indigo-800 border-indigo-200", label: "Shipped to Warehouse" },
  "Arrived at Warehouse": { color: "bg-violet-100 text-violet-800 border-violet-200", label: "Arrived at Warehouse" },
  "Shipped to Bangladesh": { color: "bg-purple-100 text-purple-800 border-purple-200", label: "Shipped to BD" },
  "In Customs": { color: "bg-orange-100 text-orange-800 border-orange-200", label: "In Customs" },
  "Out for Delivery": { color: "bg-cyan-100 text-cyan-800 border-cyan-200", label: "Out for Delivery" },
  "Delivered": { color: "bg-emerald-100 text-emerald-800 border-emerald-200", label: "Delivered" },
  processing: { color: "bg-blue-100 text-blue-800 border-blue-200", label: "Processing" },
  shipped: { color: "bg-purple-100 text-purple-800 border-purple-200", label: "Shipped" },
  delivered: { color: "bg-emerald-100 text-emerald-800 border-emerald-200", label: "Delivered" },
  completed: { color: "bg-emerald-100 text-emerald-800 border-emerald-200", label: "Completed" },
  cancelled: { color: "bg-red-100 text-red-800 border-red-200", label: "Cancelled" },
};

export default function AdminOrders() {
  const [data, setData] = useState<OrderWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedProfile, setSelectedProfile] = useState<OrderWithProfile | null>(null);
  const [editOrder, setEditOrder] = useState<OrderWithProfile | null>(null);
  const [editValues, setEditValues] = useState<Record<string, any>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [shipmentMap, setShipmentMap] = useState<Record<string, any>>({});

  const fetchOrders = async () => {
    setLoading(true);
    const [ordersRes, profilesRes, shipmentsRes] = await Promise.all([
      supabase.from("orders").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("user_id, full_name, phone, address, avatar_url"),
      supabase.from("shipments").select("*"),
    ]);
    const orders = ordersRes.data || [];
    const profiles = profilesRes.data || [];
    const shipments = shipmentsRes.data || [];
    const profileMap = new Map(profiles.map((p: any) => [p.user_id, p]));
    const sMap: Record<string, any> = {};
    shipments.forEach((s: any) => { if (s.order_id) sMap[s.order_id] = s; });
    setShipmentMap(sMap);
    setData(orders.map((o: any) => ({ ...o, profile: profileMap.get(o.user_id) || null })));
    setLoading(false);
  };

  useEffect(() => { fetchOrders(); }, []);

  const filtered = data.filter((order) => {
    const matchesSearch =
      order.order_number.toLowerCase().includes(search.toLowerCase()) ||
      order.product_name.toLowerCase().includes(search.toLowerCase()) ||
      (order.profile?.full_name || "").toLowerCase().includes(search.toLowerCase());
    const shipment = shipmentMap[order.id];
    const shipmentStatus = shipment ? shipment.status : "Ordered";
    const matchesStatus = statusFilter === "all" || shipmentStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleEdit = (order: OrderWithProfile) => {
    setEditOrder(order);
    setEditValues({
      product_name: order.product_name,
      quantity: order.quantity,
      status: order.status,
      tracking_number: order.tracking_number || "",
      shipping_charges: order.shipping_charges || 0,
      commission: order.commission || 0,
      notes: order.notes || "",
    });
  };

  const handleSaveEdit = async () => {
    if (!editOrder) return;
    setSaving(true);
    try {
      const updates = {
        ...editValues,
        shipping_charges: Number(editValues.shipping_charges) || 0,
        commission: Number(editValues.commission) || 0,
        quantity: Number(editValues.quantity) || 1,
      };
      const { error } = await supabase.from("orders").update(updates).eq("id", editOrder.id);
      if (error) throw error;
      toast({ title: "Order updated successfully" });
      setEditOrder(null);
      fetchOrders();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("orders").delete().eq("id", deleteId);
      if (error) throw error;
      toast({ title: "Order deleted" });
      setDeleteId(null);
      fetchOrders();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const SHIPMENT_STAGES = ["Ordered", "Purchased from 1688", "Shipped to Warehouse", "Arrived at Warehouse", "Shipped to Bangladesh", "In Customs", "Out for Delivery", "Delivered"];
  const statuses = ["Ordered", ...SHIPMENT_STAGES.slice(1), "all"];
  const statusCounts = statuses.reduce((acc, s) => {
    acc[s] = s === "all" ? data.length : data.filter((o) => {
      const shipment = shipmentMap[o.id];
      return shipment ? shipment.status === s : s === "Ordered";
    }).length;
    return acc;
  }, {} as Record<string, number>);

  const grandTotal = (order: OrderWithProfile) =>
    Number(order.total_price) + Number(order.shipping_charges || 0) + Number(order.commission || 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
          <p className="text-sm text-muted-foreground">{data.length} total orders</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search orders, products, customers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      {/* Status Tabs */}
      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList className="flex-wrap h-auto gap-1 bg-transparent p-0">
          {statuses.map((s) => (
            <TabsTrigger key={s} value={s} className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-4 py-1.5 text-xs capitalize border border-border">
              {s === "all" ? "All" : s} ({statusCounts[s]})
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Orders Grid */}
      {loading ? (
        <div className="flex justify-center py-20 text-muted-foreground">Loading orders...</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Package className="h-12 w-12 mb-3 opacity-40" />
          <p>No orders found</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((order) => {
            const shipment = shipmentMap[order.id];
            const shipmentStatus = shipment ? shipment.status : "Ordered";
            const sc = statusConfig[shipmentStatus] || statusConfig["Ordered"];
            return (
              <Card key={order.id} className="overflow-hidden hover:shadow-lg transition-shadow border-border/60">
                {/* Card Header */}
                <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b border-border/40">
                  <div className="flex items-center gap-2">
                    <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-mono text-sm font-semibold">{order.order_number}</span>
                  </div>
                  <Badge className={`${sc.color} border text-[10px] font-medium px-2 py-0.5`}>{sc.label}</Badge>
                </div>

                {/* Product Info */}
                <div className="p-4 space-y-4">
                  <div className="flex gap-3">
                    {order.product_image ? (
                      <img src={order.product_image} alt="" className="w-16 h-16 rounded-lg object-cover border border-border/40 flex-shrink-0" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm line-clamp-2 leading-snug">{order.product_name}</p>
                      <p className="text-xs text-muted-foreground mt-1">Qty: {order.quantity} × ৳{Number(order.unit_price).toFixed(2)}</p>
                    </div>
                  </div>

                  {/* Customer */}
                  <button
                    onClick={() => setSelectedProfile(order)}
                    className="flex items-center gap-2.5 w-full p-2.5 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-left"
                  >
                    {order.profile?.avatar_url ? (
                      <img src={order.profile.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover border border-border" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <UserCircle className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{order.profile?.full_name || "Unknown Customer"}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{order.profile?.phone || "No phone"}</p>
                    </div>
                  </button>

                  {/* Pricing Breakdown */}
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Product Total</span>
                      <span>৳{Number(order.total_price).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Shipping</span>
                      <span>৳{Number(order.shipping_charges || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Commission</span>
                      <span>৳{Number(order.commission || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between pt-1.5 border-t border-border/40 font-semibold text-sm">
                      <span>Grand Total</span>
                      <span className="text-primary">৳{grandTotal(order).toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Tracking & Notes */}
                  {order.tracking_number && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Truck className="h-3 w-3" />
                      <span className="truncate">{order.tracking_number}</span>
                      <button onClick={() => { navigator.clipboard.writeText(order.tracking_number!); toast({ title: "Copied!" }); }}>
                        <Copy className="h-3 w-3 hover:text-foreground" />
                      </button>
                    </div>
                  )}
                  {order.notes && (
                    <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <StickyNote className="h-3 w-3 mt-0.5 flex-shrink-0" />
                      <span className="line-clamp-2">{order.notes}</span>
                    </div>
                  )}

                  {/* Shipment Timeline */}
                  <ShipmentTimeline
                    orderId={order.id}
                    userId={order.user_id}
                    shipment={shipmentMap[order.id] || null}
                    onUpdate={fetchOrders}
                  />

                  {/* Links */}
                  <div className="flex gap-2">
                    {order.product_url && (
                      <a href={order.product_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                        <ExternalLink className="h-3 w-3" /> Site Link
                      </a>
                    )}
                    {order.source_url && (
                      <a href={order.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                        <ExternalLink className="h-3 w-3" /> 1688
                      </a>
                    )}
                  </div>

                  {/* Date + Actions */}
                  <div className="flex items-center justify-between pt-2 border-t border-border/40">
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {new Date(order.created_at).toLocaleDateString()}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(order)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteId(order.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Customer Profile Dialog */}
      <Dialog open={!!selectedProfile} onOpenChange={() => setSelectedProfile(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCircle className="h-5 w-5 text-primary" /> Customer Details
            </DialogTitle>
          </DialogHeader>
          {selectedProfile && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 pb-4 border-b border-border/40">
                {selectedProfile.profile?.avatar_url ? (
                  <img src={selectedProfile.profile.avatar_url} alt="" className="w-20 h-20 rounded-full object-cover border-2 border-primary/20" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                    <UserCircle className="h-10 w-10 text-primary/40" />
                  </div>
                )}
                <p className="font-semibold text-lg">{selectedProfile.profile?.full_name || "Unknown"}</p>
              </div>
              <div className="space-y-3 text-sm">
                {[
                  { label: "Phone", value: selectedProfile.profile?.phone },
                  { label: "Address", value: selectedProfile.profile?.address },
                  { label: "Order", value: `#${selectedProfile.order_number}` },
                  { label: "Product", value: selectedProfile.product_name },
                  { label: "Grand Total", value: `৳${grandTotal(selectedProfile).toFixed(2)}` },
                ].map((item) => (
                  <div key={item.label} className="flex justify-between gap-4">
                    <span className="text-muted-foreground flex-shrink-0">{item.label}</span>
                    <span className="font-medium text-right truncate max-w-[200px]">{item.value || "Not set"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editOrder} onOpenChange={() => setEditOrder(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Order #{editOrder?.order_number}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {[
              { key: "product_name", label: "Product Name", type: "text" },
              { key: "quantity", label: "Quantity", type: "number" },
              { key: "status", label: "Status", type: "text" },
              { key: "tracking_number", label: "Tracking Number", type: "text" },
              { key: "shipping_charges", label: "Shipping Charges (৳)", type: "number" },
              { key: "commission", label: "Commission (৳)", type: "number" },
              { key: "notes", label: "Notes", type: "text" },
            ].map((field) => (
              <div key={field.key}>
                <Label className="text-xs">{field.label}</Label>
                <Input
                  type={field.type}
                  value={editValues[field.key] ?? ""}
                  onChange={(e) => setEditValues((v) => ({ ...v, [field.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOrder(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Order</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure? This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>{saving ? "Deleting..." : "Delete"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
