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

    const checkAdmin = async () => {
      try {
        const role = await resolveUserRole(user.id);
        setUserRole(role);
        setIsAdmin(role === "admin");
        setIsStaff(isStaffRole(role));
      } finally {
        setLoading(false);
      }
    };

    checkAdmin();
  }, [user]);

  return { isAdmin, isStaff, userRole, loading };
}
