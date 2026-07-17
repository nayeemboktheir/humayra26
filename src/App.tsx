import { Suspense, useEffect } from "react";
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

import Index from "./pages/Index";
import Install from "./pages/Install";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import AboutUs from "./pages/AboutUs";
import ContactUs from "./pages/ContactUs";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import ReturnRefundPolicy from "./pages/ReturnRefundPolicy";
import ProhibitedItems from "./pages/ProhibitedItems";
import SellerStore from "./pages/SellerStore";
import PaymentCallback from "./pages/PaymentCallback";
import DashboardLayout from "./components/dashboard/DashboardLayout";
import Overview from "./pages/dashboard/Overview";
import Orders from "./pages/dashboard/Orders";
import Delivery from "./pages/dashboard/Delivery";
import Shipments from "./pages/dashboard/Shipments";
import Parcels from "./pages/dashboard/Parcels";
import Actions from "./pages/dashboard/Actions";
import RFQ from "./pages/dashboard/RFQ";
import Wishlist from "./pages/dashboard/Wishlist";
import Notifications from "./pages/dashboard/Notifications";
import Messages from "./pages/dashboard/Messages";
import Balance from "./pages/dashboard/Balance";
import Withdrawal from "./pages/dashboard/Withdrawal";
import Transactions from "./pages/dashboard/Transactions";
import Refunds from "./pages/dashboard/Refunds";
import Profile from "./pages/dashboard/Profile";
import Cart from "./pages/dashboard/Cart";
import AdminLayout from "./components/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminOrders from "./pages/admin/AdminOrders";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminRoles from "./pages/admin/AdminRoles";
import AdminShipments from "./pages/admin/AdminShipments";
import AdminRefunds from "./pages/admin/AdminRefunds";
import AdminTransactions from "./pages/admin/AdminTransactions";
import AdminWallets from "./pages/admin/AdminWallets";
import AdminNotifications from "./pages/admin/AdminNotifications";
import AdminWishlist from "./pages/admin/AdminWishlist";
import AdminCustomers from "./pages/admin/AdminCustomers";
import AdminAnalytics from "./pages/admin/AdminAnalytics";
import AdminMessaging from "./pages/admin/AdminMessaging";
import AdminSettings from "./pages/admin/AdminSettings";
import AdminMarketing from "./pages/admin/AdminMarketing";
import AdminSMS from "./pages/admin/AdminSMS";
import AdminPermissions from "./pages/admin/AdminPermissions";

const queryClient = new QueryClient();
const APP_VERSION = "20260717-invoice-unlocked-v6";

const repairInvoiceLabels = () => {
  if (typeof document === "undefined") return;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  nodes.forEach((node) => {
    if (node.nodeValue?.includes("Invoice locked")) {
      node.nodeValue = node.nodeValue.replace(/Invoice locked/g, "Invoice");
    }
  });
};

const useBrowserCacheBust = () => {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const previousVersion = window.localStorage.getItem("tradeon_app_version");
    window.localStorage.setItem("tradeon_app_version", APP_VERSION);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.allSettled(registrations.map((registration) => registration.unregister())))
        .catch(() => undefined);
    }

    if ("caches" in window) {
      caches.keys()
        .then((keys) => Promise.allSettled(keys.map((key) => caches.delete(key))))
        .catch(() => undefined);
    }

    const currentUrl = new URL(window.location.href);
    const alreadyOnVersion = currentUrl.searchParams.get("cache_bust") === APP_VERSION;

    if (previousVersion !== APP_VERSION && !alreadyOnVersion) {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("cache_bust", APP_VERSION);
      window.location.replace(nextUrl.toString());
    }

    repairInvoiceLabels();
    const observer = new MutationObserver(repairInvoiceLabels);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
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
