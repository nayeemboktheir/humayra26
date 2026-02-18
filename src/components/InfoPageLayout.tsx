import { useNavigate } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";
import Footer from "@/components/Footer";

interface InfoPageLayoutProps {
  title: string;
  subtitle?: string;
  breadcrumb: string;
  children: React.ReactNode;
}

const InfoPageLayout = ({ title, subtitle, breadcrumb, children }: InfoPageLayoutProps) => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Nav Bar */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
            className="text-xl font-bold text-primary tracking-tight"
          >
            TradeOn<span className="text-foreground">.global</span>
          </button>
          <button
            onClick={() => navigate(-1)}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Go Back
          </button>
        </div>
      </div>

      {/* Hero Banner */}
      <div className="relative overflow-hidden border-b">
        <div className="absolute inset-0 bg-primary opacity-[0.07] pointer-events-none" />
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-5">
            <button onClick={() => navigate("/")} className="hover:text-primary transition-colors flex items-center gap-1">
              <Home className="h-3 w-3" /> Home
            </button>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground font-medium">{breadcrumb}</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold text-foreground tracking-tight">{title}</h1>
          {subtitle && (
            <p className="mt-3 text-muted-foreground text-base sm:text-lg max-w-xl">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
          {children}
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default InfoPageLayout;
