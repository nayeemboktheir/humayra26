import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShoppingCart, Wallet, Heart, Bell, RefreshCcw, Package } from "lucide-react";

const Overview = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({ orders: 0, balance: 0, wishlist: 0, notifications: 0, refunds: 0, shipments: 0 });

  useEffect(() => {
    if (!user) return;
    const fetchStats = async () => {
      const [orders, wallet, wishlist, notifications, refunds, shipments] = await Promise.all([
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle(),
        supabase.from("wishlist").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_read", false),
        supabase.from("refunds").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("shipments").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      ]);
      setStats({
        orders: orders.count || 0,
        balance: wallet.data?.balance || 0,
        wishlist: wishlist.count || 0,
        notifications: notifications.count || 0,
        refunds: refunds.count || 0,
        shipments: shipments.count || 0,
      });
    };
    fetchStats();
  }, [user]);

  const cards = [
    { title: "Total Orders", value: stats.orders, icon: ShoppingCart, color: "text-blue-500" },
    { title: "Wallet Balance", value: `৳${stats.balance.toFixed(2)}`, icon: Wallet, color: "text-green-500" },
    { title: "Wishlist Items", value: stats.wishlist, icon: Heart, color: "text-red-500" },
    { title: "Unread Notifications", value: stats.notifications, icon: Bell, color: "text-yellow-500" },
    { title: "Refund Requests", value: stats.refunds, icon: RefreshCcw, color: "text-orange-500" },
    { title: "Active Shipments", value: stats.shipments, icon: Package, color: "text-purple-500" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Overview</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Overview;
