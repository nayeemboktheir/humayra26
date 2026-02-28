import { useNavigate, useLocation } from "react-router-dom";
import { LayoutGrid, ShoppingCart, ClipboardList, MessageCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAppSettings } from "@/hooks/useAppSettings";

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { settings } = useAppSettings();

  const items = [
    { label: "Category", icon: LayoutGrid, action: () => {
      const el = document.getElementById("top-categories");
      if (el) el.scrollIntoView({ behavior: "smooth" });
      else navigate("/");
    }},
    { label: "Cart", icon: ShoppingCart, action: () => navigate(user ? "/dashboard/orders" : "/auth") },
    { label: "center", icon: null, action: () => navigate("/") },
    { label: "Orders", icon: ClipboardList, action: () => navigate(user ? "/dashboard/orders" : "/auth") },
    { label: "Chat", icon: MessageCircle, href: settings.whatsapp_number ? `https://wa.me/88${(settings.whatsapp_number || "").replace(/-/g, "")}` : undefined },
  ];

  return (
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
                  <span className="text-primary-foreground font-extrabold text-xl tracking-tighter">T</span>
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
              className="flex flex-col items-center gap-0.5 min-w-[56px]"
            >
              <Icon className="h-5 w-5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
