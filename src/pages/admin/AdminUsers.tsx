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

  const onUpdate = async (id: string, vals: Record<string, any>) => {
    const { error } = await supabase.from("profiles").update(vals).eq("id", id);
    if (error) throw error;
  };

  const onDelete = async (id: string) => {
    const { error } = await supabase.from("profiles").delete().eq("id", id);
    if (error) throw error;
  };

  return <AdminDataTable title="Users & Profiles" columns={columns} table="profiles" searchColumns={["full_name", "phone", "address"]} onUpdate={onUpdate} onDelete={onDelete} />;
}
