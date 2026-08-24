import { supabase } from "@/integrations/supabase/client";
import AdminDataTable, { Column } from "@/components/admin/AdminDataTable";
import { Badge } from "@/components/ui/badge";

const columns: Column[] = [
  { key: "amount", label: "Amount", render: (v) => `৳${Number(v).toFixed(2)}` },
  { key: "type", label: "Type", editable: true, render: (v) => <Badge variant="outline">{v}</Badge> },
  { key: "status", label: "Status", editable: true, render: (v) => <Badge variant="secondary">{v}</Badge> },
  { key: "description", label: "Description", editable: true },
  { key: "reference_id", label: "Reference" },
  { key: "user_id", label: "User ID" },
  { key: "created_at", label: "Date", render: (v) => new Date(v).toLocaleDateString() },
];

export default function AdminTransactions() {

  const onUpdate = async (id: string, vals: Record<string, any>) => {
    const { error } = await supabase.from("transactions").update(vals).eq("id", id);
    if (error) throw error;
  };

  const onDelete = async (id: string) => {
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) throw error;
  };

  const onCreate = async (vals: Record<string, any>) => {
    const { error } = await supabase.from("transactions").insert([vals as any]);
    if (error) throw error;
  };

  return (
    <AdminDataTable
      title="Transactions"
      columns={columns}
      table="transactions"
      searchColumns={["type", "description", "reference_id", "status"]}
      onUpdate={onUpdate}
      onDelete={onDelete}
      onCreate={onCreate}
      createFields={[
        { key: "user_id", label: "User ID", required: true },
        { key: "amount", label: "Amount", type: "number", required: true },
        { key: "type", label: "Type (credit/debit)", required: true },
        { key: "description", label: "Description" },
      ]}
    />
  );
}
