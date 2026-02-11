import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminDataTable, { Column } from "@/components/admin/AdminDataTable";
import { Badge } from "@/components/ui/badge";

const columns: Column[] = [
  { key: "user_id", label: "User ID" },
  { key: "role", label: "Role", editable: true, render: (v) => <Badge>{v}</Badge> },
];

export default function AdminRoles() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = async () => {
    setLoading(true);
    const { data: d } = await supabase.from("user_roles").select("*");
    setData(d || []);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const onUpdate = async (id: string, vals: Record<string, any>) => {
    const { error } = await supabase.from("user_roles").update(vals).eq("id", id);
    if (error) throw error;
    fetch();
  };

  const onDelete = async (id: string) => {
    const { error } = await supabase.from("user_roles").delete().eq("id", id);
    if (error) throw error;
    fetch();
  };

  const onCreate = async (vals: Record<string, any>) => {
    const { error } = await supabase.from("user_roles").insert([vals as any]);
    if (error) throw error;
    fetch();
  };

  return (
    <AdminDataTable
      title="User Roles"
      columns={columns}
      data={data}
      loading={loading}
      onUpdate={onUpdate}
      onDelete={onDelete}
      onCreate={onCreate}
      createFields={[
        { key: "user_id", label: "User ID (UUID)", required: true },
        { key: "role", label: "Role (admin/moderator/user)", required: true },
      ]}
    />
  );
}
