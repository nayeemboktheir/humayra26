import { supabase } from "@/integrations/supabase/client";
import AdminDataTable, { Column } from "@/components/admin/AdminDataTable";

const columns: Column[] = [
  { key: "product_name", label: "Product" },
  { key: "product_id", label: "Product ID" },
  { key: "product_price", label: "Price", render: (v) => v ? `৳${Number(v).toFixed(2)}` : "—" },
  { key: "user_id", label: "User ID" },
  { key: "created_at", label: "Date", render: (v) => new Date(v).toLocaleDateString() },
];

export default function AdminWishlist() {

  const onDelete = async (id: string) => {
    const { error } = await supabase.from("wishlist").delete().eq("id", id);
    if (error) throw error;
  };

  return <AdminDataTable title="Wishlist" columns={columns} table="wishlist" searchColumns={["product_name", "product_id"]} onDelete={onDelete} />;
}
