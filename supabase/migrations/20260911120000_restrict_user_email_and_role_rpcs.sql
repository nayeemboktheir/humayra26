-- Audit §2.1 / §2.2 — two SECURITY DEFINER helpers were reachable as public RPCs.
--
-- Postgres grants EXECUTE on new functions to PUBLIC by default, and PostgREST exposes
-- every public-schema function as an RPC endpoint. Neither of these had a REVOKE, so
-- both were callable by `anon` using nothing but the publishable key that ships in the
-- JS bundle:
--
--   * get_user_emails() had no role check in its body at all and returned the email of
--     every row in auth.users — a full customer PII dump to an unauthenticated caller.
--     That the frontend only called it from admin pages was a UI convention, not access
--     control.
--   * has_role(_user_id, _role) takes an arbitrary user id, so it worked as an oracle
--     for enumerating who holds admin/moderator/employee. It is an internal RLS
--     predicate that was never meant to be an endpoint.
--
-- get_my_role() (20260824120100) already does this correctly and is the model here.

-- 1. get_user_emails(): enforce the admin check in the body, not just in the UI.
--
-- NOTE: this is deliberately admin-only, matching the audit's recommendation. Staff
-- with the moderator/employee role can still reach /admin/customers (AdminRoute gates
-- on isStaff), and for them this now returns no rows rather than failing loudly. If
-- non-admin staff are expected to see customer emails, widen the predicate below to
-- include those roles rather than dropping it.
CREATE OR REPLACE FUNCTION public.get_user_emails()
RETURNS TABLE(user_id uuid, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id, email::text
  FROM auth.users
  WHERE public.has_role((SELECT auth.uid()), 'admin'::app_role);
$$;

REVOKE ALL ON FUNCTION public.get_user_emails() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_emails() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_emails() TO authenticated;

-- 2. has_role(): stop exposing it as an endpoint.
--
-- Revoking EXECUTE from PUBLIC does NOT affect its use inside RLS policies — policies
-- are evaluated as the policy owner, and every existing `has_role(auth.uid(), ...)`
-- predicate keeps working. This only removes the PostgREST RPC surface.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated;
