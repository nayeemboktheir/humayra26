import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { resolveUserRole, type AppRole } from "@/lib/roles";

export function useRolePermissions() {
  const { user } = useAuth();
  const [userRole, setUserRole] = useState<AppRole>(null);
  const [allowedPages, setAllowedPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setUserRole(null);
      setAllowedPages([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const fetchPermissions = async () => {
      const role = await resolveUserRole(user.id);
      if (cancelled) return;

      if (!role) {
        setUserRole(null);
        setAllowedPages([]);
        setLoading(false);
        return;
      }

      setUserRole(role);

      const { data: perms } = await supabase
        .from("role_permissions")
        .select("page_key")
        .eq("role", role)
        .eq("can_access", true);

      if (cancelled) return;
      setAllowedPages((perms || []).map((p) => p.page_key));
      setLoading(false);
    };

    fetchPermissions();
    return () => { cancelled = true; };
  }, [user?.id]);

  const hasAccess = (pageKey: string) => allowedPages.includes(pageKey);

  return { userRole, allowedPages, hasAccess, loading };
}
