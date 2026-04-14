import { useState } from "react";
import logoIcon from "@/assets/logo-icon.png";
import { useNavigate, useLocation } from "react-router-dom";
import { LayoutGrid, ShoppingCart, ClipboardList, MessageCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { useAppSettings } from "@/hooks/useAppSettings";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const categories = [
  { name: "Shoes", icon: "👟", query: "shoes" },
  { name: "Bag", icon: "👜", query: "bag" },
  { name: "Jewelry", icon: "💎", query: "jewelry" },
  { name: "Beauty And Personal Care", icon: "💄", query: "beauty products" },
  { name: "Men's Clothing", icon: "👔", query: "men clothing" },
  { name: "Women's Clothing", icon: "👗", query: "women clothing" },
  { name: "Baby Items", icon: "🍼", query: "baby items" },
  { name: "Eyewear", icon: "🕶️", query: "eyewear sunglasses" },
  { name: "Office Supplies", icon: "📎", query: "office supplies" },
  { name: "Seasonal Products", icon: "🌸", query: "seasonal products" },
  { name: "Phone Accessories", icon: "📱", query: "phone accessories" },
  { name: "Sports And Fitness", icon: "🏋️", query: "sports fitness" },
  { name: "Entertainment Items", icon: "🎮", query: "entertainment" },
  { name: "Watches", icon: "⌚", query: "watches" },
  { name: "Automobile Items", icon: "🚗", query: "automobile accessories" },
  { name: "Groceries And Pets", icon: "🐾", query: "pet supplies" },
  { name: "Outdoor And Travelling", icon: "🏕️", query: "outdoor travelling" },
  { name: "Electronics And Gadgets", icon: "🔌", query: "electronics gadgets" },
  { name: "Kitchen Gadgets", icon: "🍳", query: "kitchen gadgets" },
  { name: "Tools And Home Improvement", icon: "🔧", query: "tools home improvement" },
  { name: "School Supplies", icon: "📚", query: "school supplies" },
];

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { settings } = useAppSettings();
  const { count: cartCount } = useCart();
  const [catOpen, setCatOpen] = useState(false);

  const handleCategorySelect = (query: string) => {
    setCatOpen(false);
    navigate(`/?category=${encodeURIComponent(query)}`);
  };

  const items = [
    { label: "Category", icon: LayoutGrid, action: () => setCatOpen(true) },
    { label: "Cart", icon: ShoppingCart, action: () => navigate(user ? "/dashboard/cart" : "/auth"), badge: cartCount },
    { label: "center", icon: null, action: () => navigate("/") },
    { label: "Orders", icon: ClipboardList, action: () => navigate(user ? "/dashboard/orders" : "/auth") },
    { label: "Chat", icon: MessageCircle, href: settings.whatsapp_number ? `https://wa.me/88${(settings.whatsapp_number || "").replace(/-/g, "")}` : undefined },
  ];

  return (
    <>
      <Sheet open={catOpen} onOpenChange={setCatOpen}>
        <SheetContent side="left" className="w-[280px] p-0">
          <SheetHeader className="p-4 border-b">
            <SheetTitle className="text-left">Categories</SheetTitle>
          </SheetHeader>
          <nav className="overflow-y-auto h-[calc(100%-60px)] p-2 space-y-0.5">
            {categories.map((cat) => (
              <button
                key={cat.name}
                onClick={() => handleCategorySelect(cat.query)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-accent transition-colors text-left"
              >
                <span className="text-lg">{cat.icon}</span>
                <span>{cat.name}</span>
              </button>
            ))}
          </nav>
        </SheetContent>
      </Sheet>

      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t md:hidden safe-area-bottom">
        <div className="flex items-center justify-around h-16 px-2 relative">
          {items.map((item) => {
            if (item.label === "center") {
              return (
                <button
                  key="center"
                  onClick={() => navigate("/")}
                  className="relative -mt-5 flex items-center justify-center"
                >
                  <div className="w-14 h-14 rounded-full bg-primary shadow-lg flex items-center justify-center border-4 border-background">
                    <img src={logoIcon} alt="TradeOn" className="w-9 h-9 object-contain" />
                  </div>
                </button>
              );
            }

            const Icon = item.icon!;

            if (item.href) {
              return (
                <a
                  key={item.label}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center gap-0.5 min-w-[56px]"
                >
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground font-medium">{item.label}</span>
                </a>
              );
            }

            return (
              <button
                key={item.label}
                onClick={item.action}
                className="flex flex-col items-center gap-0.5 min-w-[56px] relative"
              >
                <div className="relative">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  {(item as any).badge > 0 && (
                    <span className="absolute -top-1.5 -right-2 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                      {(item as any).badge > 99 ? "99+" : (item as any).badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};

export default BottomNav;
