import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "moderator" | "employee" | "user" | null;

// useAdmin and useRolePermissions both need the role, and both remount on every
// navigation, so the result is cached rather than re-resolved over the network each time.
//
// The cache is time-bounded: without a TTL a role change made by an admin never reached
// an already-signed-in user until they reloaded the app.
const ROLE_CACHE_TTL_MS = 5 * 60 * 1000;

let _cachedUserId: string | null = null;
let _cachedRole: AppRole = null;
let _cachedAt = 0;
let _inFlight: { userId: string; promise: Promise<AppRole> } | null = null;

export function clearRoleCache() {
  _cachedUserId = null;
  _cachedRole = null;
  _cachedAt = 0;
  _inFlight = null;
}

export async function resolveUserRole(userId: string): Promise<AppRole> {
  if (_cachedUserId === userId && Date.now() - _cachedAt < ROLE_CACHE_TTL_MS) {
    return _cachedRole;
  }

  // A different user signed in — drop the previous result before resolving.
  if (_cachedUserId !== null && _cachedUserId !== userId) clearRoleCache();

  // Concurrent callers (useAdmin + useRolePermissions mount together) share one request,
  // but only when it is for the same user: sharing unconditionally meant a fast account
  // switch could resolve the new user's role from the previous user's in-flight call.
  if (!_inFlight || _inFlight.userId !== userId) {
    _inFlight = {
      userId,
      promise: (async () => {
        const { data, error } = await supabase.rpc("get_my_role");
        if (error) throw error;
        return (data as AppRole) ?? null;
      })(),
    };
  }

  const pending = _inFlight;
  try {
    const role = await pending.promise;
    // Only commit if this request is still the current one — a sign-out or a newer
    // request for a different user may have superseded it while we awaited.
    if (_inFlight === pending) {
      _cachedUserId = userId;
      _cachedRole = role;
      _cachedAt = Date.now();
    }
    return role;
  } finally {
    if (_inFlight === pending) _inFlight = null;
  }
}

export function isStaffRole(role: AppRole) {
  return role === "admin" || role === "moderator" || role === "employee";
}
