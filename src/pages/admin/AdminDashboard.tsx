import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShoppingCart, Users, Truck, RefreshCcw, Receipt, Wallet, Bell, Heart } from "lucide-react";

const AdminDashboard = () => {
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      const tables = ["orders", "profiles", "shipments", "refunds", "transactions", "wallets", "notifications", "wishlist"] as const;
      const results: Record<string, number> = {};
      await Promise.all(
        tables.map(async (t) => {
          const { count } = await supabase.from(t).select("*", { count: "exact", head: true });
          results[t] = count ?? 0;
        })
      );
      setStats(results);
      setLoading(false);
    };
    fetchStats();
  }, []);

  const cards = [
    { label: "Orders", key: "orders", icon: ShoppingCart, color: "text-blue-500" },
    { label: "Users", key: "profiles", icon: Users, color: "text-green-500" },
    { label: "Shipments", key: "shipments", icon: Truck, color: "text-orange-500" },
    { label: "Refunds", key: "refunds", icon: RefreshCcw, color: "text-red-500" },
    { label: "Transactions", key: "transactions", icon: Receipt, color: "text-purple-500" },
    { label: "Wallets", key: "wallets", icon: Wallet, color: "text-yellow-500" },
    { label: "Notifications", key: "notifications", icon: Bell, color: "text-pink-500" },
    { label: "Wishlist Items", key: "wishlist", icon: Heart, color: "text-rose-500" },
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Admin Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.key}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
              <c.icon className={`h-5 w-5 ${c.color}`} />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{loading ? "..." : stats[c.key] ?? 0}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default AdminDashboard;
