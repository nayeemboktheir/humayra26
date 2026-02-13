import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/useAdmin";
import Index from "./pages/Index";
import Install from "./pages/Install";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
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
import Balance from "./pages/dashboard/Balance";
import Withdrawal from "./pages/dashboard/Withdrawal";
import Transactions from "./pages/dashboard/Transactions";
import Refunds from "./pages/dashboard/Refunds";
import Profile from "./pages/dashboard/Profile";
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
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};

const DashboardRoute = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>
    <DashboardLayout>{children}</DashboardLayout>
  </ProtectedRoute>
);

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  if (authLoading || adminLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <AdminLayout>{children}</AdminLayout>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/install" element={<Install />} />
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
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
