import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Bell, CircleDollarSign, Heart, PackageCheck, Receipt, RefreshCcw, ShoppingCart, Truck, Users, Wallet } from "lucide-react";

type OrderMetric = {
  created_at: string; total_price: number; shipping_charges: number | null; commission: number | null;
  domestic_courier_charge: number | null; payment_amount: number | null; payment_status: string; deleted_at: string | null;
};
type RecentOrder = { id: string; order_number: string; product_name: string; total_price: number; status: string; payment_status: string; created_at: string };

const formatCurrency = (value: number) => new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(value).replace("BDT", "৳");
const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const paymentBadge = (status: string) => {
  if (["paid", "completed"].includes(status?.toLowerCase())) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (["partial", "deposit", "partially_paid"].includes(status?.toLowerCase())) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
};

const AdminDashboard = () => {
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
      supabase.from("orders").select("created_at, total_price, shipping_charges, commission, domestic_courier_charge, payment_amount, payment_status, deleted_at"),
      supabase.from("orders").select("id, order_number, product_name, total_price, status, payment_status, created_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(5),
      supabase.rpc("get_shipment_stage_counts"),
    ]);
    setStats(Object.fromEntries(countResults));
    setOrders((ordersResult.data || []) as OrderMetric[]);
    setRecentOrders((recentResult.data || []) as RecentOrder[]);
    setShipmentStages(Object.fromEntries((shipmentResult.data || []).map(({ status, count }) => [status, Number(count) || 0])));
    setLastUpdated(new Date()); setLoading(false); setRefreshing(false);
  }, []);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  const activeOrders = useMemo(() => orders.filter((order) => !order.deleted_at), [orders]);
  const orderValue = useMemo(() => activeOrders.reduce((total, order) => total + Number(order.total_price || 0) + Number(order.shipping_charges || 0) + Number(order.commission || 0) + Number(order.domestic_courier_charge || 0), 0), [activeOrders]);
  const collectedAmount = useMemo(() => activeOrders.reduce((total, order) => total + Number(order.payment_amount || 0), 0), [activeOrders]);
  const paidOrders = useMemo(() => activeOrders.filter((order) => ["paid", "completed"].includes(order.payment_status?.toLowerCase())).length, [activeOrders]);
  const shipmentTotal = useMemo(() => Object.values(shipmentStages).reduce((total, count) => total + count, 0), [shipmentStages]);
  const deliveredShipments = shipmentStages.Delivered || shipmentStages.delivered || 0;
  const inTransit = Math.max(shipmentTotal - deliveredShipments - (shipmentStages.Ordered || 0), 0);
  const weeklyActivity = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - (6 - index)); return { key: dateKey(date), label: date.toLocaleDateString("en-US", { weekday: "short" }), value: 0 }; });
    const dayMap = new Map(days.map((day) => [day.key, day]));
    activeOrders.forEach((order) => { const day = dayMap.get(dateKey(new Date(order.created_at))); if (day) day.value += 1; });
    return days;
  }, [activeOrders]);
  const activityMax = Math.max(...weeklyActivity.map((day) => day.value), 1);
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

  return <div className="space-y-6 pb-8">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><div className="mb-2 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-500" /><span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Operations overview</span></div><h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1><p className="mt-1 text-sm text-muted-foreground">A clear view of your store’s orders, payments, and fulfilment.</p></div>
      <div className="flex items-center gap-3">{lastUpdated && <span className="hidden text-xs text-muted-foreground sm:inline">Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}<Button variant="outline" size="sm" className="gap-2" onClick={() => void loadDashboard(true)} disabled={refreshing}><RefreshCcw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />Refresh</Button></div>
    </div>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => <button key={card.key} type="button" onClick={() => navigate(card.path)} className="group text-left"><Card className="h-full border-border/80 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"><CardContent className="flex items-start justify-between p-5"><div><p className="text-sm font-medium text-muted-foreground">{card.label}</p><p className="mt-2 text-3xl font-bold tracking-tight">{loading ? "—" : stats[card.key] ?? 0}</p><p className="mt-2 flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-primary">View details <ArrowRight className="h-3 w-3" /></p></div><span className={`rounded-xl p-2.5 ${card.iconClass}`}><card.icon className="h-5 w-5" /></span></CardContent></Card></button>)}
    </div>
    <div className="grid gap-6 xl:grid-cols-5">
      <Card className="xl:col-span-3"><CardContent className="p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold">Sales snapshot</p><p className="mt-1 text-sm text-muted-foreground">Active order value and activity over the last 7 days</p></div><span className="rounded-xl bg-primary/10 p-2.5 text-primary"><CircleDollarSign className="h-5 w-5" /></span></div><div className="mt-7 grid gap-5 sm:grid-cols-3"><div><p className="text-2xl font-bold tracking-tight">{loading ? "—" : formatCurrency(orderValue)}</p><p className="mt-1 text-xs text-muted-foreground">Active order value</p></div><div><p className="text-2xl font-bold tracking-tight">{loading ? "—" : formatCurrency(collectedAmount)}</p><p className="mt-1 text-xs text-muted-foreground">Recorded payments</p></div><div><p className="text-2xl font-bold tracking-tight">{loading ? "—" : `${paidOrders}/${activeOrders.length}`}</p><p className="mt-1 text-xs text-muted-foreground">Orders paid in full</p></div></div><div className="mt-8 h-40 border-b border-border/70"><div className="flex h-full items-end gap-2 sm:gap-3">{weeklyActivity.map((day) => <div key={day.key} className="flex h-full flex-1 flex-col justify-end gap-2 text-center"><span className="text-xs font-semibold text-muted-foreground">{day.value || ""}</span><div className="w-full rounded-t-md bg-primary/15 px-px"><div className="w-full rounded-t-md bg-primary transition-[height]" style={{ height: `${day.value ? Math.max((day.value / activityMax) * 104, 8) : 4}px` }} /></div><span className="pb-1 text-[11px] text-muted-foreground">{day.label}</span></div>)}</div></div></CardContent></Card>
      <Card className="xl:col-span-2"><CardContent className="p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold">Fulfilment pulse</p><p className="mt-1 text-sm text-muted-foreground">Where current shipments are in the journey</p></div><span className="rounded-xl bg-orange-50 p-2.5 text-orange-600"><PackageCheck className="h-5 w-5" /></span></div><div className="mt-6 space-y-4">{[{ label: "Awaiting dispatch", value: shipmentStages.Ordered || 0, color: "bg-slate-400" }, { label: "In transit", value: inTransit, color: "bg-blue-500" }, { label: "At Dhaka warehouse", value: shipmentStages["Dhaka Warehouse"] || 0, color: "bg-amber-500" }, { label: "Delivered", value: deliveredShipments, color: "bg-emerald-500" }].map((item) => <div key={item.label}><div className="mb-1.5 flex items-center justify-between text-sm"><span className="text-muted-foreground">{item.label}</span><span className="font-semibold">{loading ? "—" : item.value}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${item.color}`} style={{ width: `${shipmentTotal ? (item.value / shipmentTotal) * 100 : 0}%` }} /></div></div>)}</div><Button variant="ghost" size="sm" className="mt-5 w-full justify-between border border-border/70" onClick={() => navigate("/admin/shipments")}>Manage shipments <ArrowRight className="h-4 w-4" /></Button></CardContent></Card>
    </div>
    <Card><CardContent className="p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold">Recent orders</p><p className="mt-1 text-sm text-muted-foreground">The newest requests placed in your store</p></div><Button variant="outline" size="sm" className="hidden gap-2 sm:inline-flex" onClick={() => navigate("/admin/orders")}>All orders <ArrowRight className="h-4 w-4" /></Button></div><div className="mt-5 divide-y divide-border/70">{loading ? <div className="py-8 text-center text-sm text-muted-foreground">Loading recent orders…</div> : recentOrders.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground">No orders have been placed yet.</div> : recentOrders.map((order) => <button key={order.id} type="button" onClick={() => navigate("/admin/orders")} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3.5 text-left transition-colors hover:bg-muted/40 sm:grid-cols-[120px_minmax(0,1fr)_auto_auto] sm:px-2"><span className="font-mono text-xs font-semibold text-primary">#{order.order_number}</span><span className="min-w-0"><span className="block truncate text-sm font-medium">{order.product_name}</span><span className="mt-0.5 block text-xs text-muted-foreground sm:hidden">{new Date(order.created_at).toLocaleDateString()}</span></span><Badge variant="outline" className={`${paymentBadge(order.payment_status)} hidden sm:inline-flex`}>{order.payment_status || "unpaid"}</Badge><span className="text-right"><span className="block text-sm font-semibold">{formatCurrency(Number(order.total_price || 0))}</span><span className="mt-0.5 hidden text-xs text-muted-foreground sm:block">{new Date(order.created_at).toLocaleDateString()}</span></span></button>)}</div><Button variant="outline" size="sm" className="mt-4 w-full gap-2 sm:hidden" onClick={() => navigate("/admin/orders")}>View all orders <ArrowRight className="h-4 w-4" /></Button></CardContent></Card>
  </div>;
};

export default AdminDashboard;
