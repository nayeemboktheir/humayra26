import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search, Phone, MapPin, ShoppingCart, Wallet, Calendar,
  Mail, UserCircle, Package, ArrowUpRight, ImageIcon, Hash, ExternalLink
} from "lucide-react";

interface CustomerData {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  avatar_url: string | null;
  created_at: string;
  order_count: number;
  total_spent: number;
  wallet_balance: number;
}

interface OrderItem {
  id: string;
  order_number: string;
  product_name: string;
  product_image: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  shipping_charges: number | null;
  commission: number | null;
  status: string;
  created_at: string;
  product_url: string | null;
}

export default function AdminCustomers() {
  const [customers, setCustomers] = useState<CustomerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CustomerData | null>(null);
  const [ordersCustomer, setOrdersCustomer] = useState<CustomerData | null>(null);
  const [customerOrders, setCustomerOrders] = useState<OrderItem[]>([]);
  const [customerShipments, setCustomerShipments] = useState<Record<string, string>>({});
  const [ordersLoading, setOrdersLoading] = useState(false);

  useEffect(() => {
    const fetchCustomers = async () => {
      setLoading(true);
      const [profilesRes, ordersRes, walletsRes] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("orders").select("user_id, total_price, shipping_charges, commission"),
        supabase.from("wallets").select("user_id, balance"),
      ]);

      const profiles = profilesRes.data || [];
      const orders = ordersRes.data || [];
      const wallets = walletsRes.data || [];

      const orderMap = new Map<string, { count: number; spent: number }>();
      orders.forEach((o: any) => {
        const existing = orderMap.get(o.user_id) || { count: 0, spent: 0 };
        existing.count += 1;
        existing.spent += Number(o.total_price) + Number(o.shipping_charges || 0) + Number(o.commission || 0);
        orderMap.set(o.user_id, existing);
      });

      const walletMap = new Map<string, number>();
      wallets.forEach((w: any) => walletMap.set(w.user_id, Number(w.balance)));

      const data: CustomerData[] = profiles.map((p: any) => ({
        user_id: p.user_id,
        full_name: p.full_name,
        phone: p.phone,
        address: p.address,
        avatar_url: p.avatar_url,
        created_at: p.created_at,
        order_count: orderMap.get(p.user_id)?.count || 0,
        total_spent: orderMap.get(p.user_id)?.spent || 0,
        wallet_balance: walletMap.get(p.user_id) || 0,
      }));

      setCustomers(data);
      setLoading(false);
    };
    fetchCustomers();
  }, []);

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    return (
      (c.full_name || "").toLowerCase().includes(q) ||
      (c.phone || "").toLowerCase().includes(q) ||
      (c.address || "").toLowerCase().includes(q)
    );
  });

  const getInitials = (name: string | null) => {
    if (!name) return "?";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const handleOrdersClick = async (e: React.MouseEvent, customer: CustomerData) => {
    e.stopPropagation();
    setOrdersCustomer(customer);
    setOrdersLoading(true);
    const [ordersRes, shipmentsRes] = await Promise.all([
      supabase
        .from("orders")
        .select("id, order_number, product_name, product_image, quantity, unit_price, total_price, shipping_charges, commission, status, created_at, product_url")
        .eq("user_id", customer.user_id)
        .order("created_at", { ascending: false }),
      supabase
        .from("shipments")
        .select("order_id, status")
        .eq("user_id", customer.user_id),
    ]);
    setCustomerOrders(ordersRes.data || []);
    const sMap: Record<string, string> = {};
    (shipmentsRes.data || []).forEach((s: any) => { if (s.order_id) sMap[s.order_id] = s.status; });
    setCustomerShipments(sMap);
    setOrdersLoading(false);
  };

  const grandTotal = (o: OrderItem) =>
    Number(o.total_price) + Number(o.shipping_charges || 0) + Number(o.commission || 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
          <p className="text-sm text-muted-foreground">{customers.length} registered customers</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Customers", value: customers.length, icon: UserCircle, color: "text-primary" },
          { label: "With Orders", value: customers.filter((c) => c.order_count > 0).length, icon: ShoppingCart, color: "text-emerald-500" },
          { label: "Total Revenue", value: `৳${customers.reduce((s, c) => s + c.total_spent, 0).toFixed(0)}`, icon: ArrowUpRight, color: "text-blue-500" },
          { label: "Avg. Orders", value: customers.length ? (customers.reduce((s, c) => s + c.order_count, 0) / customers.length).toFixed(1) : "0", icon: Package, color: "text-amber-500" },
        ].map((stat) => (
          <Card key={stat.label} className="p-4 flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-muted ${stat.color}`}>
              <stat.icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="text-lg font-bold">{stat.value}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Customer Table */}
      {loading ? (
        <div className="flex justify-center py-20 text-muted-foreground">Loading customers...</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <UserCircle className="h-12 w-12 mb-3 opacity-40" />
          <p>No customers found</p>
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium text-muted-foreground">Customer</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Phone</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Address</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">Orders</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Spent</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Balance</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Joined</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((customer) => (
                  <tr
                    key={customer.user_id}
                    className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => setSelected(customer)}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-8 w-8 border border-primary/10">
                          {customer.avatar_url ? (
                            <AvatarImage src={customer.avatar_url} alt={customer.full_name || ""} />
                          ) : null}
                          <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                            {getInitials(customer.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium truncate max-w-[150px]">{customer.full_name || "Unnamed"}</span>
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">{customer.phone || "—"}</td>
                    <td className="p-3 text-muted-foreground truncate max-w-[180px]">{customer.address || "—"}</td>
                    <td className="p-3 text-center">
                      <button
                        className="font-semibold hover:text-primary transition-colors"
                        onClick={(e) => handleOrdersClick(e, customer)}
                      >
                        {customer.order_count}
                      </button>
                    </td>
                    <td className="p-3 text-right font-medium">৳{customer.total_spent.toFixed(0)}</td>
                    <td className="p-3 text-right text-muted-foreground">৳{customer.wallet_balance.toFixed(0)}</td>
                    <td className="p-3 text-right text-muted-foreground text-xs">{new Date(customer.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Customer Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Customer Details</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-5">
              <div className="flex flex-col items-center gap-3 pb-4 border-b border-border/40">
                <Avatar className="h-20 w-20 border-2 border-primary/20">
                  {selected.avatar_url ? (
                    <AvatarImage src={selected.avatar_url} alt={selected.full_name || ""} />
                  ) : null}
                  <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
                    {getInitials(selected.full_name)}
                  </AvatarFallback>
                </Avatar>
                <p className="font-bold text-lg">{selected.full_name || "Unnamed"}</p>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span>{selected.phone || "Not set"}</span>
                </div>
                <div className="flex items-center gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="line-clamp-2">{selected.address || "Not set"}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span>Joined {new Date(selected.created_at).toLocaleDateString()}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  className="bg-muted/50 rounded-lg p-3 text-center hover:bg-primary/10 hover:ring-1 hover:ring-primary/30 transition-all cursor-pointer"
                  onClick={(e) => {
                    setSelected(null);
                    handleOrdersClick(e, selected);
                  }}
                >
                  <p className="text-xs text-muted-foreground">Orders</p>
                  <p className="font-bold text-sm mt-0.5 text-primary">{selected.order_count}</p>
                </button>
                {[
                  { label: "Spent", value: `৳${selected.total_spent.toFixed(0)}` },
                  { label: "Balance", value: `৳${selected.wallet_balance.toFixed(0)}` },
                ].map((s) => (
                  <div key={s.label} className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className="font-bold text-sm mt-0.5">{s.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Customer Orders Dialog */}
      <Dialog open={!!ordersCustomer} onOpenChange={() => setOrdersCustomer(null)}>
        <DialogContent className="max-w-lg max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
              Orders — {ordersCustomer?.full_name || "Customer"}
            </DialogTitle>
          </DialogHeader>
          {ordersLoading ? (
            <div className="flex justify-center py-10 text-muted-foreground">Loading orders...</div>
          ) : customerOrders.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-muted-foreground">
              <Package className="h-10 w-10 mb-2 opacity-40" />
              <p>No orders found</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[60vh] pr-3">
              <div className="space-y-3">
                {customerOrders.map((order) => (
                  <div key={order.id} className="flex gap-3 p-3 rounded-lg border border-border/60 hover:border-primary/20 transition-colors">
                    {order.product_image ? (
                      <img src={order.product_image} alt="" className="w-14 h-14 rounded-lg object-cover border border-border/40 flex-shrink-0" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium line-clamp-1">{order.product_name}</p>
                        <Badge variant="secondary" className="text-[10px] flex-shrink-0">{customerShipments[order.id] || "Ordered"}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-mono">#{order.order_number}</span> · Qty: {order.quantity} × ৳{Number(order.unit_price).toFixed(0)}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-primary">৳{grandTotal(order).toFixed(0)}</span>
                        <span className="text-[11px] text-muted-foreground">{new Date(order.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
