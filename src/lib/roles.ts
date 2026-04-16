import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "moderator" | "employee" | "user" | null;

const ROLE_PRIORITY: Exclude<AppRole, null>[] = ["admin", "moderator", "employee", "user"];

export async function resolveUserRole(userId: string): Promise<AppRole> {
  const results = await Promise.all(
    ROLE_PRIORITY.map(async (role) => {
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: role,
      });

      if (error) {
        throw error;
      }

      return data ? role : null;
    })
  );

  return results.find(Boolean) ?? null;
}

export function isStaffRole(role: AppRole) {
  return role === "admin" || role === "moderator" || role === "employee";
}