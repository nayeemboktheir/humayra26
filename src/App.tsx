import { Suspense, lazy, useEffect, useSyncExternalStore } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { CartProvider } from "@/contexts/CartContext";
import { useAdmin } from "@/hooks/useAdmin";
import { Loader2 } from "lucide-react";
import PageLoader from "@/components/PageLoader";
import TrackingScripts from "@/components/TrackingScripts";
import { subscribeCurrency, getCurrencyVersion } from "@/lib/currency";

import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

// Route-level code splitting. Admin and dashboard screens (and the heavy libraries
// they pull in — recharts, jspdf, html2canvas) are no longer part of the bundle a
// first-time visitor downloads to browse products.
const AboutUs = lazy(() => import("./pages/AboutUs"));
const Actions = lazy(() => import("./pages/dashboard/Actions"));
const AdminAnalytics = lazy(() => import("./pages/admin/AdminAnalytics"));
const AdminCustomers = lazy(() => import("./pages/admin/AdminCustomers"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminLayout = lazy(() => import("./components/admin/AdminLayout"));
const AdminMarketing = lazy(() => import("./pages/admin/AdminMarketing"));
const AdminMessaging = lazy(() => import("./pages/admin/AdminMessaging"));
const AdminNotifications = lazy(() => import("./pages/admin/AdminNotifications"));
const AdminOrders = lazy(() => import("./pages/admin/AdminOrders"));
const AdminPermissions = lazy(() => import("./pages/admin/AdminPermissions"));
const AdminRefunds = lazy(() => import("./pages/admin/AdminRefunds"));
const AdminRoles = lazy(() => import("./pages/admin/AdminRoles"));
const AdminSMS = lazy(() => import("./pages/admin/AdminSMS"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
const AdminShipments = lazy(() => import("./pages/admin/AdminShipments"));
const AdminTransactions = lazy(() => import("./pages/admin/AdminTransactions"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminWallets = lazy(() => import("./pages/admin/AdminWallets"));
const AdminWishlist = lazy(() => import("./pages/admin/AdminWishlist"));
const Balance = lazy(() => import("./pages/dashboard/Balance"));
const Cart = lazy(() => import("./pages/dashboard/Cart"));
const ContactUs = lazy(() => import("./pages/ContactUs"));
const DashboardLayout = lazy(() => import("./components/dashboard/DashboardLayout"));
const Delivery = lazy(() => import("./pages/dashboard/Delivery"));
const Install = lazy(() => import("./pages/Install"));
const Messages = lazy(() => import("./pages/dashboard/Messages"));
const Notifications = lazy(() => import("./pages/dashboard/Notifications"));
const Orders = lazy(() => import("./pages/dashboard/Orders"));
const Overview = lazy(() => import("./pages/dashboard/Overview"));
const Parcels = lazy(() => import("./pages/dashboard/Parcels"));
const PaymentCallback = lazy(() => import("./pages/PaymentCallback"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const Profile = lazy(() => import("./pages/dashboard/Profile"));
const ProhibitedItems = lazy(() => import("./pages/ProhibitedItems"));
const RFQ = lazy(() => import("./pages/dashboard/RFQ"));
const Refunds = lazy(() => import("./pages/dashboard/Refunds"));
const ReturnRefundPolicy = lazy(() => import("./pages/ReturnRefundPolicy"));
const SellerStore = lazy(() => import("./pages/SellerStore"));
const Shipments = lazy(() => import("./pages/dashboard/Shipments"));
const Transactions = lazy(() => import("./pages/dashboard/Transactions"));
const Wishlist = lazy(() => import("./pages/dashboard/Wishlist"));
const Withdrawal = lazy(() => import("./pages/dashboard/Withdrawal"));


const queryClient = new QueryClient();
const APP_VERSION = "20260717-force-hostinger-v8";

const useBrowserCacheBust = () => {
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("tradeon_app_version", APP_VERSION);

    // One-time cleanup of legacy SW/caches; deferred to idle so it doesn't block first paint.
    const cleanup = () => {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistrations()
          .then((regs) => Promise.allSettled(regs.map((r) => r.unregister())))
          .catch(() => undefined);
      }
      if ("caches" in window) {
        caches.keys()
          .then((keys) => Promise.allSettled(keys.map((k) => caches.delete(k))))
          .catch(() => undefined);
      }
    };
    const ric = (window as any).requestIdleCallback || ((cb: () => void) => setTimeout(cb, 2000));
    ric(cleanup);
  }, []);
};


const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};

const DashboardRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const { isStaff, loading: adminLoading } = useAdmin();
  if (authLoading || adminLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (isStaff) return <Navigate to="/admin" replace />;
  return (
    <Suspense fallback={<PageLoader />}>
      <DashboardLayout>{children}</DashboardLayout>
    </Suspense>
  );
};

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const { isStaff, loading: adminLoading } = useAdmin();
  if (authLoading || adminLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isStaff) return <Navigate to="/dashboard" replace />;
  return (
    <Suspense fallback={<PageLoader />}>
      <AdminLayout>{children}</AdminLayout>
    </Suspense>
  );
};

const App = () => {
  useBrowserCacheBust();
  // Re-render the tree once the async currency settings land so every price that was
  // painted with the fallback rate is recalculated.
  useSyncExternalStore(subscribeCurrency, getCurrencyVersion, getCurrencyVersion);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <CartProvider>
            <TrackingScripts />
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/about-us" element={<AboutUs />} />
                <Route path="/contact-us" element={<ContactUs />} />
                <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                <Route path="/return-refund-policy" element={<ReturnRefundPolicy />} />
                <Route path="/prohibited-items" element={<ProhibitedItems />} />
                <Route path="/install" element={<Install />} />
                <Route path="/seller/:vendorId" element={<SellerStore />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/payment/callback" element={<PaymentCallback />} />
                <Route path="/dashboard" element={<DashboardRoute><Overview /></DashboardRoute>} />
                <Route path="/dashboard/orders" element={<DashboardRoute><Orders /></DashboardRoute>} />
                <Route path="/dashboard/delivery" element={<DashboardRoute><Delivery /></DashboardRoute>} />
                <Route path="/dashboard/shipments" element={<DashboardRoute><Shipments /></DashboardRoute>} />
                <Route path="/dashboard/parcels" element={<DashboardRoute><Parcels /></DashboardRoute>} />
                <Route path="/dashboard/actions" element={<DashboardRoute><Actions /></DashboardRoute>} />
                <Route path="/dashboard/rfq" element={<DashboardRoute><RFQ /></DashboardRoute>} />
                <Route path="/dashboard/wishlist" element={<DashboardRoute><Wishlist /></DashboardRoute>} />
                <Route path="/dashboard/notifications" element={<DashboardRoute><Notifications /></DashboardRoute>} />
                <Route path="/dashboard/messages" element={<DashboardRoute><Messages /></DashboardRoute>} />
                <Route path="/dashboard/balance" element={<DashboardRoute><Balance /></DashboardRoute>} />
                <Route path="/dashboard/withdrawal" element={<DashboardRoute><Withdrawal /></DashboardRoute>} />
                <Route path="/dashboard/transactions" element={<DashboardRoute><Transactions /></DashboardRoute>} />
                <Route path="/dashboard/refunds" element={<DashboardRoute><Refunds /></DashboardRoute>} />
                <Route path="/dashboard/profile" element={<DashboardRoute><Profile /></DashboardRoute>} />
                <Route path="/dashboard/cart" element={<DashboardRoute><Cart /></DashboardRoute>} />
                <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
                <Route path="/admin/orders" element={<AdminRoute><AdminOrders /></AdminRoute>} />
                <Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
                <Route path="/admin/roles" element={<AdminRoute><AdminRoles /></AdminRoute>} />
                <Route path="/admin/shipments" element={<AdminRoute><AdminShipments /></AdminRoute>} />
                <Route path="/admin/refunds" element={<AdminRoute><AdminRefunds /></AdminRoute>} />
                <Route path="/admin/transactions" element={<AdminRoute><AdminTransactions /></AdminRoute>} />
                <Route path="/admin/wallets" element={<AdminRoute><AdminWallets /></AdminRoute>} />
                <Route path="/admin/notifications" element={<AdminRoute><AdminNotifications /></AdminRoute>} />
                <Route path="/admin/wishlist" element={<AdminRoute><AdminWishlist /></AdminRoute>} />
                <Route path="/admin/customers" element={<AdminRoute><AdminCustomers /></AdminRoute>} />
                <Route path="/admin/analytics" element={<AdminRoute><AdminAnalytics /></AdminRoute>} />
                <Route path="/admin/messaging" element={<AdminRoute><AdminMessaging /></AdminRoute>} />
                <Route path="/admin/settings" element={<AdminRoute><AdminSettings /></AdminRoute>} />
                <Route path="/admin/marketing" element={<AdminRoute><AdminMarketing /></AdminRoute>} />
                <Route path="/admin/sms" element={<AdminRoute><AdminSMS /></AdminRoute>} />
                <Route path="/admin/permissions" element={<AdminRoute><AdminPermissions /></AdminRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </CartProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
