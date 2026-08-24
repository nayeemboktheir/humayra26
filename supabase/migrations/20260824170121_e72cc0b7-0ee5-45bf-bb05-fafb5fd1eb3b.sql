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

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles (user_id);