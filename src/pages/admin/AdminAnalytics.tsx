import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from "recharts";
import { TrendingUp, DollarSign, ShoppingCart, Package, Loader2 } from "lucide-react";

export default function AdminAnalytics() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from("orders").select("*").order("created_at", { ascending: true });
      setOrders(data || []);
      setLoading(false);
    };
    fetch();
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  // Revenue metrics
  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total_price) + Number(o.shipping_charges || 0) + Number(o.commission || 0), 0);
  const totalCommission = orders.reduce((sum, o) => sum + Number(o.commission || 0), 0);
  const totalShipping = orders.reduce((sum, o) => sum + Number(o.shipping_charges || 0), 0);
  const avgOrderValue = orders.length ? totalRevenue / orders.length : 0;

  // Monthly revenue data
  const monthlyData: Record<string, { month: string; revenue: number; orders: number; commission: number }> = {};
  orders.forEach((o) => {
    const month = new Date(o.created_at).toLocaleDateString("en", { year: "numeric", month: "short" });
    if (!monthlyData[month]) monthlyData[month] = { month, revenue: 0, orders: 0, commission: 0 };
    monthlyData[month].revenue += Number(o.total_price) + Number(o.shipping_charges || 0) + Number(o.commission || 0);
    monthlyData[month].orders += 1;
    monthlyData[month].commission += Number(o.commission || 0);
  });
  const monthlyChart = Object.values(monthlyData);

  // Status breakdown
  const statusCounts: Record<string, number> = {};
  orders.forEach((o) => { statusCounts[o.status] = (statusCounts[o.status] || 0) + 1; });
  const statusChart = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

  // Top products
  const productSales: Record<string, { name: string; qty: number; revenue: number }> = {};
  orders.forEach((o) => {
    const key = o.product_name.substring(0, 40);
    if (!productSales[key]) productSales[key] = { name: key, qty: 0, revenue: 0 };
    productSales[key].qty += o.quantity;
    productSales[key].revenue += Number(o.total_price);
  });
  const topProducts = Object.values(productSales).sort((a, b) => b.revenue - a.revenue).slice(0, 8);

  const COLORS = ["hsl(var(--primary))", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#6366f1"];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Revenue Analytics</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Revenue", value: `৳${totalRevenue.toFixed(0)}`, icon: DollarSign, color: "text-emerald-500" },
          { label: "Total Commission", value: `৳${totalCommission.toFixed(0)}`, icon: TrendingUp, color: "text-purple-500" },
          { label: "Total Shipping", value: `৳${totalShipping.toFixed(0)}`, icon: Package, color: "text-blue-500" },
          { label: "Avg Order Value", value: `৳${avgOrderValue.toFixed(0)}`, icon: ShoppingCart, color: "text-amber-500" },
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

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm">Monthly Revenue</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={monthlyChart}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Orders by Month</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyChart}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Bar dataKey="orders" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Order Status Breakdown</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={statusChart} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, value }) => `${name} (${value})`}>
                  {statusChart.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Top Products by Revenue</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={topProducts} layout="vertical">
                <XAxis type="number" className="text-xs" />
                <YAxis type="category" dataKey="name" width={120} className="text-xs" tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="revenue" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
