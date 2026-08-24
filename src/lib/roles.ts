import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "moderator" | "employee" | "user" | null;

// Resolution is cached per user for the session. useAdmin and useRolePermissions both
// need the role, and both remount on every navigation, so without this the same role
// is re-resolved over the network on every single route change.
let _cachedUserId: string | null = null;
let _cachedRole: AppRole = null;
let _inFlight: Promise<AppRole> | null = null;

export function clearRoleCache() {
  _cachedUserId = null;
  _cachedRole = null;
  _inFlight = null;
}

export async function resolveUserRole(userId: string): Promise<AppRole> {
  if (_cachedUserId === userId) return _cachedRole;

  // A different user signed in — drop the previous result before resolving.
  if (_cachedUserId !== null && _cachedUserId !== userId) clearRoleCache();

  // Concurrent callers (useAdmin + useRolePermissions mount together) share one request.
  if (!_inFlight) {
    _inFlight = (async () => {
      const { data, error } = await supabase.rpc("get_my_role");
      if (error) throw error;
      return (data as AppRole) ?? null;
    })();
  }

  try {
    const role = await _inFlight;
    _cachedUserId = userId;
    _cachedRole = role;
    return role;
  } finally {
    _inFlight = null;
  }
}

export function isStaffRole(role: AppRole) {
  return role === "admin" || role === "moderator" || role === "employee";
}
