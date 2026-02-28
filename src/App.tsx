import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/useAdmin";
import { Loader2 } from "lucide-react";
import PageLoader from "@/components/PageLoader";
import TrackingScripts from "@/components/TrackingScripts";

// Lazy load all pages
const Index = lazy(() => import("./pages/Index"));
const Install = lazy(() => import("./pages/Install"));
const Auth = lazy(() => import("./pages/Auth"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AboutUs = lazy(() => import("./pages/AboutUs"));
const ContactUs = lazy(() => import("./pages/ContactUs"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const ReturnRefundPolicy = lazy(() => import("./pages/ReturnRefundPolicy"));
const ProhibitedItems = lazy(() => import("./pages/ProhibitedItems"));
const SellerStore = lazy(() => import("./pages/SellerStore"));

// Dashboard pages
const DashboardLayout = lazy(() => import("./components/dashboard/DashboardLayout"));
const Overview = lazy(() => import("./pages/dashboard/Overview"));
const Orders = lazy(() => import("./pages/dashboard/Orders"));
const Delivery = lazy(() => import("./pages/dashboard/Delivery"));
const Shipments = lazy(() => import("./pages/dashboard/Shipments"));
const Parcels = lazy(() => import("./pages/dashboard/Parcels"));
const Actions = lazy(() => import("./pages/dashboard/Actions"));
const RFQ = lazy(() => import("./pages/dashboard/RFQ"));
const Wishlist = lazy(() => import("./pages/dashboard/Wishlist"));
const Notifications = lazy(() => import("./pages/dashboard/Notifications"));
const Balance = lazy(() => import("./pages/dashboard/Balance"));
const Withdrawal = lazy(() => import("./pages/dashboard/Withdrawal"));
const Transactions = lazy(() => import("./pages/dashboard/Transactions"));
const Refunds = lazy(() => import("./pages/dashboard/Refunds"));
const Profile = lazy(() => import("./pages/dashboard/Profile"));

// Admin pages
const AdminLayout = lazy(() => import("./components/admin/AdminLayout"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminOrders = lazy(() => import("./pages/admin/AdminOrders"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminRoles = lazy(() => import("./pages/admin/AdminRoles"));
const AdminShipments = lazy(() => import("./pages/admin/AdminShipments"));
const AdminRefunds = lazy(() => import("./pages/admin/AdminRefunds"));
const AdminTransactions = lazy(() => import("./pages/admin/AdminTransactions"));
const AdminWallets = lazy(() => import("./pages/admin/AdminWallets"));
const AdminNotifications = lazy(() => import("./pages/admin/AdminNotifications"));
const AdminWishlist = lazy(() => import("./pages/admin/AdminWishlist"));
const AdminCustomers = lazy(() => import("./pages/admin/AdminCustomers"));
const AdminAnalytics = lazy(() => import("./pages/admin/AdminAnalytics"));
const AdminMessaging = lazy(() => import("./pages/admin/AdminMessaging"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};

const DashboardRoute = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>
    <Suspense fallback={<PageLoader />}>
      <DashboardLayout>{children}</DashboardLayout>
    </Suspense>
  </ProtectedRoute>
);

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  if (authLoading || adminLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return (
    <Suspense fallback={<PageLoader />}>
      <AdminLayout>{children}</AdminLayout>
    </Suspense>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
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
              <Route path="/dashboard" element={<DashboardRoute><Overview /></DashboardRoute>} />
              <Route path="/dashboard/orders" element={<DashboardRoute><Orders /></DashboardRoute>} />
              <Route path="/dashboard/delivery" element={<DashboardRoute><Delivery /></DashboardRoute>} />
              <Route path="/dashboard/shipments" element={<DashboardRoute><Shipments /></DashboardRoute>} />
              <Route path="/dashboard/parcels" element={<DashboardRoute><Parcels /></DashboardRoute>} />
              <Route path="/dashboard/actions" element={<DashboardRoute><Actions /></DashboardRoute>} />
              <Route path="/dashboard/rfq" element={<DashboardRoute><RFQ /></DashboardRoute>} />
              <Route path="/dashboard/wishlist" element={<DashboardRoute><Wishlist /></DashboardRoute>} />
              <Route path="/dashboard/notifications" element={<DashboardRoute><Notifications /></DashboardRoute>} />
              <Route path="/dashboard/balance" element={<DashboardRoute><Balance /></DashboardRoute>} />
              <Route path="/dashboard/withdrawal" element={<DashboardRoute><Withdrawal /></DashboardRoute>} />
              <Route path="/dashboard/transactions" element={<DashboardRoute><Transactions /></DashboardRoute>} />
              <Route path="/dashboard/refunds" element={<DashboardRoute><Refunds /></DashboardRoute>} />
              <Route path="/dashboard/profile" element={<DashboardRoute><Profile /></DashboardRoute>} />
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
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
