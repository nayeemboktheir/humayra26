import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminDataTable, { Column } from "@/components/admin/AdminDataTable";
import { Badge } from "@/components/ui/badge";

const columns: Column[] = [
  { key: "order_number", label: "Order #" },
  { key: "product_name", label: "Product", editable: true },
  { key: "quantity", label: "Qty", editable: true },
  { key: "total_price", label: "Total", render: (v) => `৳${Number(v).toFixed(2)}` },
  { key: "status", label: "Status", editable: true, render: (v) => <Badge variant={v === "completed" ? "default" : "secondary"}>{v}</Badge> },
  { key: "tracking_number", label: "Tracking", editable: true },
  { key: "created_at", label: "Date", render: (v) => new Date(v).toLocaleDateString() },
];

export default function AdminOrders() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = async () => {
    setLoading(true);
    const { data: d } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
    setData(d || []);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const onUpdate = async (id: string, vals: Record<string, any>) => {
    const { error } = await supabase.from("orders").update(vals).eq("id", id);
    if (error) throw error;
    fetch();
  };

  const onDelete = async (id: string) => {
    const { error } = await supabase.from("orders").delete().eq("id", id);
    if (error) throw error;
    fetch();
  };

  return <AdminDataTable title="Orders" columns={columns} data={data} loading={loading} onUpdate={onUpdate} onDelete={onDelete} />;
}
