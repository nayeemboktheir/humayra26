import { ReactNode, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, ShoppingCart, Truck, Package, RefreshCcw,
  Receipt, Wallet, Bell, Heart, Users, Shield, LogOut, Menu, X,
  ChevronDown, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface NavItem {
  label: string;
  icon: any;
  path?: string;
  children?: { label: string; path: string; icon: any }[];
}

const navItems: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/admin" },
  { label: "Customers", icon: Users, path: "/admin/customers" },
  { label: "Users & Profiles", icon: Shield, path: "/admin/users" },
  { label: "User Roles", icon: Shield, path: "/admin/roles" },
  { label: "Orders", icon: ShoppingCart, path: "/admin/orders" },
  { label: "Shipments", icon: Truck, path: "/admin/shipments" },
  { label: "Refunds", icon: RefreshCcw, path: "/admin/refunds" },
  { label: "Transactions", icon: Receipt, path: "/admin/transactions" },
  { label: "Wallets", icon: Wallet, path: "/admin/wallets" },
  { label: "Notifications", icon: Bell, path: "/admin/notifications" },
  { label: "Wishlist", icon: Heart, path: "/admin/wishlist" },
];

const AdminLayout = ({ children }: { children: ReactNode }) => {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isActive = (path?: string) => path === location.pathname;

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <h2 className="font-bold text-lg text-primary cursor-pointer flex items-center gap-2" onClick={() => navigate("/admin")}>
          <Shield className="h-5 w-5" />
          Admin Panel
        </h2>
        <p className="text-xs text-muted-foreground truncate mt-1">{user?.email}</p>
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {navItems.map((item) => (
          <button
            key={item.label}
            onClick={() => {
              if (item.path) {
                navigate(item.path);
                setSidebarOpen(false);
              }
            }}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
              isActive(item.path)
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left">{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="p-3 border-t space-y-1">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground"
          onClick={() => navigate("/")}
        >
          <LayoutDashboard className="h-4 w-4" />
          Back to Site
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground"
          onClick={signOut}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-card border-r transform transition-transform lg:relative lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="lg:hidden absolute right-2 top-2">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        {sidebarContent}
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 bg-card border-b px-4 py-3 flex items-center gap-3 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="font-semibold">Admin Panel</h1>
        </header>
        <main className="flex-1 p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
