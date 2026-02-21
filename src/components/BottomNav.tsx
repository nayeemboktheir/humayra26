import { useNavigate, useLocation } from "react-router-dom";
import { LayoutGrid, User, Phone, MessageCircle, ShoppingCart } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAppSettings } from "@/hooks/useAppSettings";

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { settings } = useAppSettings();

  const items = [
    { label: "Category", icon: LayoutGrid, path: "/#categories" },
    { label: "Account", icon: User, path: user ? "/dashboard" : "/auth" },
    { label: "center", icon: ShoppingCart, path: "/" },
    { label: "Call", icon: Phone, href: `tel:+88${(settings.contact_phone || "").replace(/-/g, "")}` },
    { label: "Chat", icon: MessageCircle, href: settings.whatsapp_number ? `https://wa.me/88${(settings.whatsapp_number || "").replace(/-/g, "")}` : undefined },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-r from-primary to-primary/90 md:hidden safe-area-bottom shadow-lg">
      <div className="flex items-center justify-around h-14 px-1 relative">
        {items.map((item) => {
          if (item.label === "center") {
            return (
              <button
                key="center"
                onClick={() => navigate("/")}
                className="relative -mt-6 flex items-center justify-center"
              >
                <div className="w-14 h-14 rounded-full bg-primary-foreground shadow-lg flex items-center justify-center border-4 border-primary/30">
                  <span className="text-primary font-extrabold text-lg tracking-tighter">T</span>
                </div>
              </button>
            );
          }

          const isActive = item.path && location.pathname === item.path;

          if (item.href) {
            return (
              <a
                key={item.label}
                href={item.href}
                target={item.label === "Chat" ? "_blank" : undefined}
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-0.5 min-w-[56px]"
              >
                <item.icon className="h-5 w-5 text-primary-foreground/90" />
                <span className="text-[10px] text-primary-foreground/80 font-medium">{item.label}</span>
              </a>
            );
          }

          return (
            <button
              key={item.label}
              onClick={() => {
                if (item.label === "Category") {
                  const el = document.getElementById("top-categories");
                  if (el) el.scrollIntoView({ behavior: "smooth" });
                  else navigate("/");
                } else if (item.path) {
                  navigate(item.path);
                }
              }}
              className="flex flex-col items-center gap-0.5 min-w-[56px]"
            >
              <item.icon className={`h-5 w-5 ${isActive ? "text-primary-foreground" : "text-primary-foreground/80"}`} />
              <span className={`text-[10px] font-medium ${isActive ? "text-primary-foreground" : "text-primary-foreground/80"}`}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
