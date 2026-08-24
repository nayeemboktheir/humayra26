import { supabase } from "@/integrations/supabase/client";
import AdminDataTable, { Column } from "@/components/admin/AdminDataTable";

const columns: Column[] = [
  { key: "user_id", label: "User ID" },
  { key: "balance", label: "Balance (BDT)", editable: true, render: (v) => `৳${Number(v).toFixed(2)}` },
  { key: "created_at", label: "Created", render: (v) => new Date(v).toLocaleDateString() },
  { key: "updated_at", label: "Updated", render: (v) => new Date(v).toLocaleDateString() },
];

export default function AdminWallets() {

  const onUpdate = async (id: string, vals: Record<string, any>) => {
    const { error } = await supabase.from("wallets").update({ balance: Number(vals.balance) }).eq("id", id);
    if (error) throw error;
  };

  return <AdminDataTable title="Wallets" columns={columns} table="wallets" onUpdate={onUpdate} />;
}
