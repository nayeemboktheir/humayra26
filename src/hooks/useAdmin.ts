import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { isStaffRole, resolveUserRole, type AppRole } from "@/lib/roles";

export function useAdmin() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isStaff, setIsStaff] = useState(false);
  const [userRole, setUserRole] = useState<AppRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      setIsStaff(false);
      setUserRole(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const checkAdmin = async () => {
      try {
        const role = await resolveUserRole(user.id);
        if (cancelled) return;
        setUserRole(role);
        setIsAdmin(role === "admin");
        setIsStaff(isStaffRole(role));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    checkAdmin();
    return () => { cancelled = true; };
  }, [user?.id]);

  return { isAdmin, isStaff, userRole, loading };
}
