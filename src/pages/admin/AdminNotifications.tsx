import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminDataTable, { Column } from "@/components/admin/AdminDataTable";
import { Badge } from "@/components/ui/badge";

const columns: Column[] = [
  { key: "title", label: "Title" },
  { key: "message", label: "Message" },
  { key: "type", label: "Type", render: (v) => <Badge variant="outline">{v}</Badge> },
  { key: "is_read", label: "Read", render: (v) => v ? "Yes" : "No" },
  { key: "user_id", label: "User ID" },
  { key: "created_at", label: "Date", render: (v) => new Date(v).toLocaleDateString() },
];

export default function AdminNotifications() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = async () => {
    setLoading(true);
    const { data: d } = await supabase.from("notifications").select("*").order("created_at", { ascending: false });
    setData(d || []);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const onDelete = async (id: string) => {
    const { error } = await supabase.from("notifications").delete().eq("id", id);
    if (error) throw error;
    fetch();
  };

  const onCreate = async (vals: Record<string, any>) => {
    const { error } = await supabase.from("notifications").insert([vals as any]);
    if (error) throw error;
    fetch();
  };

  return (
    <AdminDataTable
      title="Notifications"
      columns={columns}
      data={data}
      loading={loading}
      onDelete={onDelete}
      onCreate={onCreate}
      createFields={[
        { key: "user_id", label: "User ID", required: true },
        { key: "title", label: "Title", required: true },
        { key: "message", label: "Message", required: true },
        { key: "type", label: "Type (info/warning/error)" },
      ]}
    />
  );
}
