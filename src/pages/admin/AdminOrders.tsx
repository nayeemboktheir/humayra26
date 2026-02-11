import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminDataTable, { Column } from "@/components/admin/AdminDataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExternalLink, UserCircle } from "lucide-react";

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
  user_email?: string;
}

export default function AdminOrders() {
  const [data, setData] = useState<OrderWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState<OrderWithProfile | null>(null);

  const fetchOrders = async () => {
    setLoading(true);
    const [ordersRes, profilesRes] = await Promise.all([
      supabase.from("orders").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("user_id, full_name, phone, address, avatar_url"),
    ]);

    const orders = ordersRes.data || [];
    const profiles = profilesRes.data || [];
    const profileMap = new Map(profiles.map((p: any) => [p.user_id, p]));

    const mapped: OrderWithProfile[] = orders.map((o: any) => ({
      ...o,
      profile: profileMap.get(o.user_id) || null,
    }));
    setData(mapped);
    setLoading(false);
  };

  useEffect(() => { fetchOrders(); }, []);

  const onUpdate = async (id: string, vals: Record<string, any>) => {
    // Convert numeric fields
    const updates: Record<string, any> = { ...vals };
    if (updates.shipping_charges !== undefined) updates.shipping_charges = Number(updates.shipping_charges) || 0;
    if (updates.commission !== undefined) updates.commission = Number(updates.commission) || 0;
    if (updates.quantity !== undefined) updates.quantity = Number(updates.quantity) || 1;

    const { error } = await supabase.from("orders").update(updates).eq("id", id);
    if (error) throw error;
    fetchOrders();
  };

  const onDelete = async (id: string) => {
    const { error } = await supabase.from("orders").delete().eq("id", id);
    if (error) throw error;
    fetchOrders();
  };

  const columns: Column[] = [
    { key: "order_number", label: "Order #" },
    {
      key: "user_id", label: "Customer", render: (_v, row) => {
        const name = row.profile?.full_name || "Unknown";
        return (
          <Button variant="ghost" size="sm" className="text-xs p-1 h-auto gap-1" onClick={() => setSelectedProfile(row)}>
            <UserCircle className="h-3.5 w-3.5" />
            <span className="truncate max-w-[80px]">{name}</span>
          </Button>
        );
      }
    },
    { key: "product_name", label: "Product", editable: true },
    { key: "product_image", label: "Image", render: (v) => v ? <img src={v} alt="" className="w-10 h-10 rounded object-cover" referrerPolicy="no-referrer" /> : "—" },
    { key: "quantity", label: "Qty", editable: true },
    { key: "total_price", label: "Total", render: (v) => `৳${Number(v).toFixed(2)}` },
    { key: "shipping_charges", label: "Shipping", editable: true, render: (v) => `৳${Number(v || 0).toFixed(2)}` },
    { key: "commission", label: "Commission", editable: true, render: (v) => `৳${Number(v || 0).toFixed(2)}` },
    { key: "status", label: "Status", editable: true, render: (v) => <Badge variant={v === "completed" ? "default" : "secondary"}>{v}</Badge> },
    { key: "tracking_number", label: "Tracking", editable: true },
    { key: "product_url", label: "Site Link", render: (v) => v ? <a href={v} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 text-xs"><ExternalLink className="h-3 w-3" />View</a> : "—" },
    { key: "source_url", label: "1688 Link", render: (v) => v ? <a href={v} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 text-xs"><ExternalLink className="h-3 w-3" />1688</a> : "—" },
    { key: "notes", label: "Notes", editable: true },
    { key: "created_at", label: "Date", render: (v) => new Date(v).toLocaleDateString() },
  ];

  return (
    <>
      <AdminDataTable title="Orders" columns={columns} data={data} loading={loading} onUpdate={onUpdate} onDelete={onDelete} />

      {/* Customer Profile Dialog */}
      <Dialog open={!!selectedProfile} onOpenChange={() => setSelectedProfile(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCircle className="h-5 w-5" /> Customer Details
            </DialogTitle>
          </DialogHeader>
          {selectedProfile && (
            <div className="space-y-4">
              {selectedProfile.profile?.avatar_url && (
                <div className="flex justify-center">
                  <img src={selectedProfile.profile.avatar_url} alt="Avatar" className="w-20 h-20 rounded-full object-cover border-2 border-muted" />
                </div>
              )}
              <div className="space-y-3 text-sm">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-medium">{selectedProfile.profile?.full_name || "Not set"}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Phone</span>
                  <span className="font-medium">{selectedProfile.profile?.phone || "Not set"}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Address</span>
                  <span className="font-medium text-right max-w-[200px]">{selectedProfile.profile?.address || "Not set"}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Order</span>
                  <span className="font-medium">#{selectedProfile.order_number}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Product</span>
                  <span className="font-medium truncate max-w-[200px]">{selectedProfile.product_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-medium">৳{Number(selectedProfile.total_price).toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
