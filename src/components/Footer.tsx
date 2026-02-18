import { useNavigate } from "react-router-dom";
import { MapPin, Mail, Phone } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import PaymentLogos from "@/components/PaymentLogos";




const Footer = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <footer className="border-t-4 border-primary bg-card mt-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Company Info */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-primary">TradeOn<span className="text-foreground">.global</span></h2>

            <div className="space-y-3 text-sm">
              <div>
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <MapPin className="h-4 w-4 text-primary" />
                  HEAD OFFICE:
                </div>
                <p className="text-muted-foreground ml-6">House 16, Road 07, Nikunja-02, Dhaka, Bangladesh, 1229</p>
              </div>
              <div>
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <Mail className="h-4 w-4 text-primary" />
                  EMAIL:
                </div>
                <a href="mailto:info@TradeOn.global" className="text-muted-foreground ml-6 hover:text-primary transition-colors">
                  info@TradeOn.global
                </a>
              </div>
              <div>
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <Phone className="h-4 w-4 text-primary" />
                  PHONE:
                </div>
                <a href="tel:+8801898889950" className="text-muted-foreground ml-6 hover:text-primary transition-colors">
                  01898-889950
                </a>
              </div>
            </div>
          </div>

          {/* Customer Links */}
          <div>
            <h3 className="font-bold text-foreground mb-4 uppercase tracking-wide">Customer</h3>
            <div className="space-y-2.5 text-sm">
              <button onClick={() => navigate(user ? "/dashboard" : "/auth")} className="block text-muted-foreground hover:text-primary transition-colors">
                Account
              </button>
              <button onClick={() => navigate("/dashboard/orders")} className="block text-muted-foreground hover:text-primary transition-colors">
                Cart
              </button>
              <button onClick={() => navigate("/dashboard/wishlist")} className="block text-muted-foreground hover:text-primary transition-colors">
                Wishlist
              </button>
              <button onClick={() => navigate("/dashboard/orders")} className="block text-muted-foreground hover:text-primary transition-colors">
                My Orders
              </button>
            </div>
          </div>

          {/* Information Links */}
          <div>
            <h3 className="font-bold text-foreground mb-4 uppercase tracking-wide">Information</h3>
            <div className="space-y-2.5 text-sm">
              <button onClick={() => navigate("/about-us")} className="block text-muted-foreground hover:text-primary transition-colors">About Us</button>
              <button onClick={() => navigate("/contact-us")} className="block text-muted-foreground hover:text-primary transition-colors">Contact Us</button>
              <button onClick={() => navigate("/privacy-policy")} className="block text-muted-foreground hover:text-primary transition-colors">Privacy Policy</button>
              <button onClick={() => navigate("/return-refund-policy")} className="block text-muted-foreground hover:text-primary transition-colors">Return & Refund</button>
              <button onClick={() => navigate("/return-refund-policy")} className="block text-muted-foreground hover:text-primary transition-colors">Cancellation Policy</button>
              <button onClick={() => navigate("/prohibited-items")} className="block text-muted-foreground hover:text-primary transition-colors">Prohibited Items</button>
            </div>
          </div>

          {/* Social Links */}
          <div>
            <h3 className="font-bold text-foreground mb-4 uppercase tracking-wide">Social Links</h3>
            <div className="flex items-center gap-3">
              <a href="https://facebook.com" target="_blank" rel="noopener noreferrer"
                className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-80 transition-opacity">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              </a>
              <a href="https://youtube.com" target="_blank" rel="noopener noreferrer"
                className="w-9 h-9 rounded-full bg-foreground text-background flex items-center justify-center hover:opacity-80 transition-opacity">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"/><path fill="hsl(var(--background))" d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
              </a>
            </div>
          </div>
        </div>

        {/* Payment Methods */}
        <div className="border-t mt-8 pt-6">
          <PaymentLogos />
        </div>

        {/* Copyright */}
        <div className="border-t mt-6 pt-6 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} tradeon.global - Wholesale from China to Bangladesh</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
