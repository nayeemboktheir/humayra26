-- Resolve the caller's highest-priority role in ONE round trip.
--
-- resolveUserRole() previously fired four separate has_role RPCs (one per role) and
-- was called by both useAdmin and useRolePermissions, so every dashboard/admin
-- navigation cost 8 role round trips before the page's own data query started.
--
-- SECURITY DEFINER so it can read user_roles without the admin-only SELECT policy,
-- and it derives the user from auth.uid() rather than taking a parameter — unlike
-- has_role(_user_id, _role), it cannot be used to probe another user's roles.
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = (SELECT auth.uid())
  ORDER BY CASE role
    WHEN 'admin'     THEN 1
    WHEN 'moderator' THEN 2
    WHEN 'employee'  THEN 3
    WHEN 'user'      THEN 4
    ELSE 5
  END
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_my_role() FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

-- Backs the ORDER BY above and every has_role() probe.
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles (user_id);
