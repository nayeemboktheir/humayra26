import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminDataTable, { Column } from "@/components/admin/AdminDataTable";

const columns: Column[] = [
  { key: "user_id", label: "User ID" },
  { key: "full_name", label: "Full Name", editable: true },
  { key: "phone", label: "Phone", editable: true },
  { key: "address", label: "Address", editable: true },
  { key: "created_at", label: "Joined", render: (v) => new Date(v).toLocaleDateString() },
];

export default function AdminUsers() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = async () => {
    setLoading(true);
    const { data: d } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    setData(d || []);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const onUpdate = async (id: string, vals: Record<string, any>) => {
    const { error } = await supabase.from("profiles").update(vals).eq("id", id);
    if (error) throw error;
    fetch();
  };

  const onDelete = async (id: string) => {
    const { error } = await supabase.from("profiles").delete().eq("id", id);
    if (error) throw error;
    fetch();
  };

  return <AdminDataTable title="Users & Profiles" columns={columns} data={data} loading={loading} onUpdate={onUpdate} onDelete={onDelete} />;
}
