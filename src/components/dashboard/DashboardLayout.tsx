import { ReactNode, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, ShoppingCart, Truck, Package, Ship, AlertCircle,
  FileText, Heart, Bell, Wallet, CreditCard, ArrowDownToLine,
  Receipt, RefreshCcw, UserCircle, Info, ChevronDown, ChevronRight,
  LogOut, Menu, X
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface NavItem {
  label: string;
  icon: any;
  path?: string;
  children?: { label: string; path: string; icon: any }[];
}

const navItems: NavItem[] = [
  { label: "Overview", icon: LayoutDashboard, path: "/dashboard" },
  {
    label: "Buy & Ship for me", icon: ShoppingCart,
    children: [
      { label: "My Orders", path: "/dashboard/orders", icon: ShoppingCart },
      { label: "My Delivery", path: "/dashboard/delivery", icon: Truck },
    ],
  },
  {
    label: "Ship for me", icon: Ship,
    children: [
      { label: "My Shipment", path: "/dashboard/shipments", icon: Package },
      { label: "My Parcel", path: "/dashboard/parcels", icon: Package },
    ],
  },
  { label: "Action Needed", icon: AlertCircle, path: "/dashboard/actions" },
  { label: "RFQ Management", icon: FileText, path: "/dashboard/rfq" },
  { label: "Wishlist", icon: Heart, path: "/dashboard/wishlist" },
  { label: "Notification", icon: Bell, path: "/dashboard/notifications" },
  {
    label: "My Wallet", icon: Wallet,
    children: [
      { label: "My Balance", path: "/dashboard/balance", icon: CreditCard },
      { label: "Withdrawal Account", path: "/dashboard/withdrawal", icon: ArrowDownToLine },
    ],
  },
  { label: "Transactions", icon: Receipt, path: "/dashboard/transactions" },
  { label: "Refund", icon: RefreshCcw, path: "/dashboard/refunds" },
  {
    label: "My Profile", icon: UserCircle,
    children: [
      { label: "Information", path: "/dashboard/profile", icon: Info },
    ],
  },
];

const DashboardLayout = ({ children }: { children: ReactNode }) => {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [expandedItems, setExpandedItems] = useState<string[]>(["Buy & Ship for me", "Ship for me", "My Wallet", "My Profile"]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleExpand = (label: string) => {
    setExpandedItems((prev) =>
      prev.includes(label) ? prev.filter((i) => i !== label) : [...prev, label]
    );
  };

  const isActive = (path?: string) => path === location.pathname;

  const renderNavItem = (item: NavItem) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.includes(item.label);
    const isItemActive = item.path ? isActive(item.path) : item.children?.some((c) => isActive(c.path));

    return (
      <div key={item.label}>
        <button
          onClick={() => {
            if (hasChildren) {
              toggleExpand(item.label);
            } else if (item.path) {
              navigate(item.path);
              setSidebarOpen(false);
            }
          }}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
            isItemActive
              ? "bg-primary/10 text-primary font-medium"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          )}
        >
          <item.icon className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">{item.label}</span>
          {hasChildren && (
            isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
          )}
        </button>
        {hasChildren && isExpanded && (
          <div className="ml-4 mt-1 space-y-0.5">
            {item.children!.map((child) => (
              <button
                key={child.path}
                onClick={() => { navigate(child.path); setSidebarOpen(false); }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                  isActive(child.path)
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <child.icon className="h-3.5 w-3.5 shrink-0" />
                <span>{child.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <h2 className="font-bold text-lg text-foreground cursor-pointer" onClick={() => navigate("/")}>
          MoveOn
        </h2>
        <p className="text-xs text-muted-foreground truncate mt-1">{user?.email}</p>
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {navItems.map(renderNavItem)}
      </nav>
      <div className="p-3 border-t">
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
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
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

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 bg-card border-b px-4 py-3 flex items-center gap-3 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="font-semibold">Dashboard</h1>
        </header>
        <main className="flex-1 p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
