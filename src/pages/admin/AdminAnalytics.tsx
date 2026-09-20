import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend } from "recharts";
import { TrendingUp, DollarSign, ShoppingCart, Package, Loader2, CircleDollarSign, ClipboardList, Boxes, WalletCards } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const formatCurrency = (value: number) => `৳${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const truncateLabel = (value: string, maxLength = 26) => value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;

export default function AdminAnalytics() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState("all");

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from("orders").select("*").order("created_at", { ascending: true });
      setOrders(data || []);
      setLoading(false);
    };
    fetch();
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  const getMonthKey = (date: string) => {
    const parsedDate = new Date(date);
    return `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, "0")}`;
  };

  const monthOptions = Array.from(new Set(orders.map((order) => getMonthKey(order.created_at))))
    .sort((a, b) => b.localeCompare(a))
    .map((value) => ({
      value,
      label: new Date(`${value}-01T00:00:00`).toLocaleDateString("en", { year: "numeric", month: "long" }),
    }));

  const filteredOrders = selectedMonth === "all"
    ? orders
    : orders.filter((order) => getMonthKey(order.created_at) === selectedMonth);

  // Revenue metrics
  const totalRevenue = filteredOrders.reduce((sum, o) => sum + Number(o.total_price) + Number(o.shipping_charges || 0) + Number(o.commission || 0), 0);
  const totalCommission = filteredOrders.reduce((sum, o) => sum + Number(o.commission || 0), 0);
  const totalShipping = filteredOrders.reduce((sum, o) => sum + Number(o.shipping_charges || 0), 0);
  const avgOrderValue = filteredOrders.length ? totalRevenue / filteredOrders.length : 0;
  const totalItems = filteredOrders.reduce((sum, o) => sum + Number(o.quantity || 0), 0);
  const paidStatuses = ["paid", "completed", "partial", "deposit", "partially_paid"];
  const totalPaid = filteredOrders.reduce((sum, o) => (
    paidStatuses.includes((o.payment_status || "").toLowerCase())
      ? sum + Number(o.payment_amount || 0)
      : sum
  ), 0);
  const outstandingBalance = Math.max(0, totalRevenue - totalPaid);
  const deliveredOrders = filteredOrders.filter((o) => (o.status || "").toLowerCase() === "delivered").length;
  const deliveryRate = filteredOrders.length ? (deliveredOrders / filteredOrders.length) * 100 : 0;

  // Monthly revenue data
  const monthlyData: Record<string, { month: string; monthKey: string; revenue: number; orders: number; commission: number }> = {};
  filteredOrders.forEach((o) => {
    const monthKey = getMonthKey(o.created_at);
    const month = new Date(`${monthKey}-01T00:00:00`).toLocaleDateString("en", { year: "numeric", month: "short" });
    if (!monthlyData[monthKey]) monthlyData[monthKey] = { month, monthKey, revenue: 0, orders: 0, commission: 0 };
    monthlyData[monthKey].revenue += Number(o.total_price) + Number(o.shipping_charges || 0) + Number(o.commission || 0);
    monthlyData[monthKey].orders += 1;
    monthlyData[monthKey].commission += Number(o.commission || 0);
  });
  const monthlyChart = Object.values(monthlyData).sort((a, b) => a.monthKey.localeCompare(b.monthKey));

  // Daily detail for a selected month so the selected-month charts remain useful.
  const dailyData: { day: string; dayKey: string; revenue: number; orders: number }[] = [];
  if (selectedMonth !== "all") {
    const [year, month] = selectedMonth.split("-").map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let day = 1; day <= daysInMonth; day += 1) {
      const dayKey = `${selectedMonth}-${String(day).padStart(2, "0")}`;
      dailyData.push({ day: String(day), dayKey, revenue: 0, orders: 0 });
    }
    filteredOrders.forEach((order) => {
      const date = new Date(order.created_at);
      const dayKey = `${getMonthKey(order.created_at)}-${String(date.getDate()).padStart(2, "0")}`;
      const point = dailyData.find((item) => item.dayKey === dayKey);
      if (point) {
        point.revenue += Number(order.total_price) + Number(order.shipping_charges || 0) + Number(order.commission || 0);
        point.orders += 1;
      }
    });
  }
  const trendData = selectedMonth === "all" ? monthlyChart : dailyData;
  const trendLabel = selectedMonth === "all" ? "Monthly" : "Daily";
  const trendXAxisKey = selectedMonth === "all" ? "month" : "day";

  // Status breakdown
  const statusCounts: Record<string, number> = {};
  filteredOrders.forEach((o) => { statusCounts[o.status] = (statusCounts[o.status] || 0) + 1; });
  const statusChart = Object.entries(statusCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Top products
  const productSales: Record<string, { name: string; qty: number; revenue: number }> = {};
  filteredOrders.forEach((o) => {
    const key = o.product_name.substring(0, 40);
    if (!productSales[key]) productSales[key] = { name: key, qty: 0, revenue: 0 };
    productSales[key].qty += o.quantity;
    productSales[key].revenue += Number(o.total_price);
  });
  const topProducts = Object.values(productSales)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8)
    .map((product) => ({ ...product, shortName: truncateLabel(product.name) }));

  const COLORS = ["hsl(var(--primary))", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#6366f1"];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Revenue Analytics</h1>
        <div className="w-full sm:w-52">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger aria-label="Filter analytics by month">
              <SelectValue placeholder="Select a month" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All months</SelectItem>
              {monthOptions.map((month) => (
                <SelectItem key={month.value} value={month.value}>{month.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Revenue", value: formatCurrency(totalRevenue), icon: DollarSign, color: "text-emerald-500" },
          { label: "Total Commission", value: formatCurrency(totalCommission), icon: TrendingUp, color: "text-purple-500" },
          { label: "Total Shipping", value: formatCurrency(totalShipping), icon: Package, color: "text-blue-500" },
          { label: "Avg Order Value", value: formatCurrency(avgOrderValue), icon: ShoppingCart, color: "text-amber-500" },
        ].map((c) => (
          <Card key={c.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{c.label}</CardTitle>
              <c.icon className={`h-4 w-4 ${c.color}`} />
            </CardHeader>
            <CardContent><p className="text-2xl font-bold">{c.value}</p></CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Orders", value: filteredOrders.length.toLocaleString(), detail: `${deliveryRate.toFixed(0)}% delivered`, icon: ClipboardList, color: "text-blue-500" },
          { label: "Items Sold", value: totalItems.toLocaleString(), detail: `${filteredOrders.length ? (totalItems / filteredOrders.length).toFixed(1) : 0} items per order`, icon: Boxes, color: "text-violet-500" },
          { label: "Payments Collected", value: formatCurrency(totalPaid), detail: "Recorded paid payments", icon: CircleDollarSign, color: "text-emerald-500" },
          { label: "Outstanding Balance", value: formatCurrency(outstandingBalance), detail: "Revenue not yet collected", icon: WalletCards, color: "text-rose-500" },
        ].map((metric) => (
          <Card key={metric.label} className="bg-muted/20">
            <CardContent className="pt-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{metric.label}</p>
                  <p className="mt-1 text-xl font-bold tracking-tight">{metric.value}</p>
                </div>
                <metric.icon className={`h-4 w-4 ${metric.color}`} />
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">{metric.detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{trendLabel} Revenue</CardTitle>
            <p className="text-xs text-muted-foreground">{selectedMonth === "all" ? "Revenue performance over time" : "Revenue trend for the selected month"}</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey={trendXAxisKey} className="text-xs" interval={selectedMonth === "all" ? 0 : "preserveStartEnd"} />
                <YAxis className="text-xs" />
                <Tooltip formatter={(value: number) => [formatCurrency(value), "Revenue"]} />
                <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Orders by {selectedMonth === "all" ? "Month" : "Day"}</CardTitle>
            <p className="text-xs text-muted-foreground">{selectedMonth === "all" ? "Order volume by month" : "Daily order volume for the selected month"}</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey={trendXAxisKey} className="text-xs" interval={selectedMonth === "all" ? 0 : "preserveStartEnd"} />
                <YAxis className="text-xs" />
                <Tooltip formatter={(value: number) => [value.toLocaleString(), "Orders"]} />
                <Bar dataKey="orders" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Order Status Breakdown</CardTitle>
            <p className="text-xs text-muted-foreground">Current order pipeline for this period</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={statusChart} cx="50%" cy="50%" innerRadius={58} outerRadius={88} paddingAngle={2} dataKey="value">
                  {statusChart.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(value: number) => [value.toLocaleString(), "Orders"]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-3 text-xs sm:grid-cols-3">
              {statusChart.map((status, index) => (
                <div key={status.name} className="flex min-w-0 items-center gap-1.5">
                  <span className="h-2 w-2 flex-none rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                  <span className="truncate text-muted-foreground capitalize">{status.name.replace(/_/g, " ")}</span>
                  <span className="ml-auto font-semibold">{status.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Top Products by Revenue</CardTitle>
            <p className="text-xs text-muted-foreground">Eight best-performing products in this period</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={topProducts} layout="vertical">
                <XAxis type="number" className="text-xs" />
                <YAxis type="category" dataKey="shortName" width={155} className="text-xs" tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value: number) => [formatCurrency(value), "Revenue"]} labelFormatter={(_, payload) => payload?.[0]?.payload?.name || "Product"} />
                <Bar dataKey="revenue" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
