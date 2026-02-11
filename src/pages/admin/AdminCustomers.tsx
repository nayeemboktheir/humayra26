import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Search, Phone, MapPin, ShoppingCart, Wallet, Calendar,
  Mail, UserCircle, Package, ArrowUpRight
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

export default function AdminCustomers() {
  const [customers, setCustomers] = useState<CustomerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CustomerData | null>(null);

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

      {/* Customer Grid */}
      {loading ? (
        <div className="flex justify-center py-20 text-muted-foreground">Loading customers...</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <UserCircle className="h-12 w-12 mb-3 opacity-40" />
          <p>No customers found</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((customer) => (
            <Card
              key={customer.user_id}
              className="p-4 cursor-pointer hover:shadow-lg hover:border-primary/30 transition-all group"
              onClick={() => setSelected(customer)}
            >
              <div className="flex items-center gap-3 mb-3">
                <Avatar className="h-11 w-11 border-2 border-primary/10 group-hover:border-primary/30 transition-colors">
                  {customer.avatar_url ? (
                    <AvatarImage src={customer.avatar_url} alt={customer.full_name || ""} />
                  ) : null}
                  <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                    {getInitials(customer.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">{customer.full_name || "Unnamed"}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {customer.phone || "No phone"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-muted/50 rounded-md p-2 text-center">
                  <p className="text-muted-foreground mb-0.5">Orders</p>
                  <p className="font-bold text-sm">{customer.order_count}</p>
                </div>
                <div className="bg-muted/50 rounded-md p-2 text-center">
                  <p className="text-muted-foreground mb-0.5">Spent</p>
                  <p className="font-bold text-sm">৳{customer.total_spent.toFixed(0)}</p>
                </div>
              </div>

              <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/40">
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Wallet className="h-3 w-3" />
                  ৳{customer.wallet_balance.toFixed(0)}
                </div>
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {new Date(customer.created_at).toLocaleDateString()}
                </div>
              </div>
            </Card>
          ))}
        </div>
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
                {[
                  { label: "Orders", value: selected.order_count },
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
    </div>
  );
}
