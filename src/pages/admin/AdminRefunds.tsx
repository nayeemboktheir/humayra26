import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminDataTable, { Column } from "@/components/admin/AdminDataTable";
import { Badge } from "@/components/ui/badge";

const columns: Column[] = [
  { key: "amount", label: "Amount", render: (v) => `৳${Number(v).toFixed(2)}` },
  { key: "status", label: "Status", editable: true, render: (v) => <Badge variant={v === "approved" ? "default" : v === "rejected" ? "destructive" : "secondary"}>{v}</Badge> },
  { key: "reason", label: "Reason", editable: true },
  { key: "order_id", label: "Order ID" },
  { key: "user_id", label: "User ID" },
  { key: "created_at", label: "Date", render: (v) => new Date(v).toLocaleDateString() },
];

export default function AdminRefunds() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = async () => {
    setLoading(true);
    const { data: d } = await supabase.from("refunds").select("*").order("created_at", { ascending: false });
    setData(d || []);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const onUpdate = async (id: string, vals: Record<string, any>) => {
    const { error } = await supabase.from("refunds").update(vals).eq("id", id);
    if (error) throw error;
    fetch();
  };

  const onDelete = async (id: string) => {
    const { error } = await supabase.from("refunds").delete().eq("id", id);
    if (error) throw error;
    fetch();
  };

  return <AdminDataTable title="Refunds" columns={columns} data={data} loading={loading} onUpdate={onUpdate} onDelete={onDelete} />;
}
