import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import ProgressMetricCard, { type SeriesPoint } from "@/components/ui/progress-metric-card";
import {
  ArrowRight,
  Bell,
  Heart,
  PackageCheck,
  Receipt,
  RefreshCcw,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
} from "lucide-react";

type OrderMetric = {
  created_at: string;
  deleted_at: string | null;
};

type RecentOrder = {
  id: string;
  order_number: string;
  product_name: string;
  total_price: number;
  payment_status: string;
  created_at: string;
};

const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const formatCurrency = (value: number) => new Intl.NumberFormat("en-BD", {
  style: "currency",
  currency: "BDT",
  maximumFractionDigits: 0,
}).format(value);

const paymentBadge = (status: string) => {
  if (["paid", "completed"].includes(status?.toLowerCase())) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (["partial", "deposit", "partially_paid"].includes(status?.toLowerCase())) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Record<string, number>>({});
  const [orders, setOrders] = useState<OrderMetric[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [shipmentStages, setShipmentStages] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadDashboard = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    const tables = ["orders", "profiles", "shipments", "refunds", "transactions", "wallets", "notifications", "wishlist"] as const;
    const [countResults, ordersResult, recentResult, shipmentResult] = await Promise.all([
      Promise.all(tables.map(async (table) => {
        const { count } = await supabase.from(table).select("*", { count: "exact", head: true });
        return [table, count ?? 0] as const;
      })),
      supabase.from("orders").select("created_at, deleted_at"),
      supabase
        .from("orders")
        .select("id, order_number, product_name, total_price, payment_status, created_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(4),
      supabase.rpc("get_shipment_stage_counts"),
    ]);

    setStats(Object.fromEntries(countResults));
    setOrders((ordersResult.data || []) as OrderMetric[]);
    setRecentOrders((recentResult.data || []) as RecentOrder[]);
    setShipmentStages(Object.fromEntries((shipmentResult.data || []).map(({ status, count }) => [status, Number(count) || 0])));
    setLastUpdated(new Date());
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  const activeOrders = useMemo(() => orders.filter((order) => !order.deleted_at), [orders]);
  const orderActivity = useMemo<SeriesPoint[]>(() => {
    const days = Array.from({ length: 30 }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (29 - index));
      return { key: dateKey(date), date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }), value: 0 };
    });
    const dayMap = new Map(days.map((day) => [day.key, day]));
    activeOrders.forEach((order) => {
      const day = dayMap.get(dateKey(new Date(order.created_at)));
      if (day) day.value += 1;
    });
    return days.map(({ date, value }) => ({ date, value }));
  }, [activeOrders]);

  const shipmentTotal = useMemo(() => Object.values(shipmentStages).reduce((total, count) => total + count, 0), [shipmentStages]);
  const deliveredShipments = shipmentStages.Delivered || shipmentStages.delivered || 0;
  const inTransit = Math.max(shipmentTotal - deliveredShipments - (shipmentStages.Ordered || 0), 0);

  const cards = [
    { label: "Orders", key: "orders", icon: ShoppingCart, iconClass: "bg-blue-50 text-blue-600", path: "/admin/orders" },
    { label: "Users", key: "profiles", icon: Users, iconClass: "bg-emerald-50 text-emerald-600", path: "/admin/users" },
    { label: "Shipments", key: "shipments", icon: Truck, iconClass: "bg-orange-50 text-orange-600", path: "/admin/shipments" },
    { label: "Refunds", key: "refunds", icon: RefreshCcw, iconClass: "bg-rose-50 text-rose-600", path: "/admin/refunds" },
    { label: "Transactions", key: "transactions", icon: Receipt, iconClass: "bg-violet-50 text-violet-600", path: "/admin/transactions" },
    { label: "Wallets", key: "wallets", icon: Wallet, iconClass: "bg-amber-50 text-amber-600", path: "/admin/wallets" },
    { label: "Notifications", key: "notifications", icon: Bell, iconClass: "bg-pink-50 text-pink-600", path: "/admin/notifications" },
    { label: "Wishlist items", key: "wishlist", icon: Heart, iconClass: "bg-red-50 text-red-600", path: "/admin/wishlist" },
  ];

  return (
    <div className="space-y-4 pb-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
          </div>
          <p className="mt-0.5 pl-4 text-xs text-muted-foreground">Orders, payments, and fulfilment at a glance.</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && <span className="hidden text-xs text-muted-foreground sm:inline">Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
          <Button variant="outline" size="sm" className="h-8 gap-1.5 px-3" onClick={() => void loadDashboard(true)} disabled={refreshing}>
            <RefreshCcw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        {cards.map((card) => (
          <button key={card.key} type="button" aria-label={`View ${card.label}`} onClick={() => navigate(card.path)} className="group text-left">
            <Card className="h-full border-border/80 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm">
              <CardContent className="flex items-center justify-between gap-2 p-3">
                <div>
                  <p className="truncate text-xs font-medium text-muted-foreground">{card.label}</p>
                  <p className="mt-1 text-2xl font-bold leading-none tracking-tight">{loading ? "—" : stats[card.key] ?? 0}</p>
                </div>
                <span className={`shrink-0 rounded-lg p-2 ${card.iconClass}`}><card.icon className="h-4 w-4" /></span>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <ProgressMetricCard
          title="Total orders"
          total={loading ? "—" : activeOrders.length}
          delta={`+${orderActivity.at(-1)?.value ?? 0}`}
          deltaLabel="orders today"
          unit="orders"
          data={orderActivity}
          period="Past 30 days"
          size="sm"
          loading={loading}
          valueFormatter={(value) => `${value} orders`}
          className="xl:col-span-3"
        />

        <Card className="xl:col-span-2">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">Fulfilment pulse</p>
                <p className="mt-1 text-sm text-muted-foreground">Where current shipments are in the journey</p>
              </div>
              <span className="rounded-xl bg-orange-50 p-2.5 text-orange-600"><PackageCheck className="h-5 w-5" /></span>
            </div>
            <div className="mt-4 space-y-3">
              {[
                { label: "Awaiting dispatch", value: shipmentStages.Ordered || 0, color: "bg-slate-400" },
                { label: "In transit", value: inTransit, color: "bg-blue-500" },
                { label: "At Dhaka warehouse", value: shipmentStages["Dhaka Warehouse"] || 0, color: "bg-amber-500" },
                { label: "Delivered", value: deliveredShipments, color: "bg-emerald-500" },
              ].map((item) => (
                <div key={item.label}>
                  <div className="mb-1.5 flex items-center justify-between text-sm"><span className="text-muted-foreground">{item.label}</span><span className="font-semibold">{loading ? "—" : item.value}</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${item.color}`} style={{ width: `${shipmentTotal ? (item.value / shipmentTotal) * 100 : 0}%` }} /></div>
                </div>
              ))}
            </div>
            <Button variant="ghost" size="sm" className="mt-4 w-full justify-between border border-border/70" onClick={() => navigate("/admin/shipments")}>Manage shipments <ArrowRight className="h-4 w-4" /></Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-sm font-semibold">Recent orders</p><p className="mt-1 text-sm text-muted-foreground">The newest requests placed in your store</p></div>
            <Button variant="outline" size="sm" className="hidden gap-2 sm:inline-flex" onClick={() => navigate("/admin/orders")}>All orders <ArrowRight className="h-4 w-4" /></Button>
          </div>
          <div className="mt-3 divide-y divide-border/70">
            {loading ? <div className="py-8 text-center text-sm text-muted-foreground">Loading recent orders…</div> : recentOrders.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground">No orders have been placed yet.</div> : recentOrders.map((order) => (
              <button key={order.id} type="button" onClick={() => navigate("/admin/orders")} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-2.5 text-left transition-colors hover:bg-muted/40 sm:grid-cols-[120px_minmax(0,1fr)_auto_auto] sm:px-2">
                <span className="font-mono text-xs font-semibold text-primary">#{order.order_number}</span>
                <span className="min-w-0"><span className="block truncate text-sm font-medium">{order.product_name}</span><span className="mt-0.5 block text-xs text-muted-foreground sm:hidden">{new Date(order.created_at).toLocaleDateString()}</span></span>
                <Badge variant="outline" className={`${paymentBadge(order.payment_status)} hidden sm:inline-flex`}>{order.payment_status || "unpaid"}</Badge>
                <span className="text-right"><span className="block text-sm font-semibold">{formatCurrency(Number(order.total_price || 0))}</span><span className="mt-0.5 hidden text-xs text-muted-foreground sm:block">{new Date(order.created_at).toLocaleDateString()}</span></span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
