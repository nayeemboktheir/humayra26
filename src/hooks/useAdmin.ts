import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { isStaffRole, resolveUserRole, type AppRole } from "@/lib/roles";

export function useAdmin() {
  const { user, loading: authLoading } = useAuth();
  const [resolved, setResolved] = useState<{ userId: string | null; role: AppRole }>({
    userId: null,
    role: null,
  });

  useEffect(() => {
    if (!user) {
      setResolved({ userId: null, role: null });
      return;
    }

    let cancelled = false;
    resolveUserRole(user.id)
      .then((role) => {
        if (!cancelled) setResolved({ userId: user.id, role });
      })
      .catch(() => {
        if (!cancelled) setResolved({ userId: user.id, role: null });
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // While auth is still loading, or the role hasn't been resolved for the current user,
  // report loading=true. This prevents a race where AdminRoute/DashboardRoute momentarily
  // sees user=present + isStaff=false and redirects away before the role check completes.
  const resolvedForCurrentUser = user ? resolved.userId === user.id : true;
  const loading = authLoading || (!!user && !resolvedForCurrentUser);
  const role: AppRole = resolvedForCurrentUser ? resolved.role : null;

  return {
    isAdmin: role === "admin",
    isStaff: isStaffRole(role),
    userRole: role,
    loading,
  };
}
