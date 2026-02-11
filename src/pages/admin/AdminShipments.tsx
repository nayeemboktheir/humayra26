import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminDataTable, { Column } from "@/components/admin/AdminDataTable";
import { Badge } from "@/components/ui/badge";

const columns: Column[] = [
  { key: "tracking_number", label: "Tracking #", editable: true },
  { key: "carrier", label: "Carrier", editable: true },
  { key: "status", label: "Status", editable: true, render: (v) => <Badge variant="secondary">{v}</Badge> },
  { key: "estimated_delivery", label: "Est. Delivery", editable: true },
  { key: "user_id", label: "User ID" },
  { key: "created_at", label: "Date", render: (v) => new Date(v).toLocaleDateString() },
];

export default function AdminShipments() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = async () => {
    setLoading(true);
    const { data: d } = await supabase.from("shipments").select("*").order("created_at", { ascending: false });
    setData(d || []);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const onUpdate = async (id: string, vals: Record<string, any>) => {
    const { error } = await supabase.from("shipments").update(vals).eq("id", id);
    if (error) throw error;
    fetch();
  };

  const onDelete = async (id: string) => {
    const { error } = await supabase.from("shipments").delete().eq("id", id);
    if (error) throw error;
    fetch();
  };

  const onCreate = async (vals: Record<string, any>) => {
    const { error } = await supabase.from("shipments").insert([vals as any]);
    if (error) throw error;
    fetch();
  };

  return (
    <AdminDataTable
      title="Shipments"
      columns={columns}
      data={data}
      loading={loading}
      onUpdate={onUpdate}
      onDelete={onDelete}
      onCreate={onCreate}
      createFields={[
        { key: "user_id", label: "User ID", required: true },
        { key: "tracking_number", label: "Tracking Number" },
        { key: "carrier", label: "Carrier" },
        { key: "status", label: "Status", required: true },
      ]}
    />
  );
}
