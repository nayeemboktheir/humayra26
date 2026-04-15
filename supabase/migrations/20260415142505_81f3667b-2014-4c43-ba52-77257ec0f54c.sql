CREATE TABLE public.role_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  role public.app_role NOT NULL,
  page_key text NOT NULL,
  can_access boolean NOT NULL DEFAULT false,
  UNIQUE(role, page_key)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage role permissions"
ON public.role_permissions
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can read role permissions"
ON public.role_permissions
FOR SELECT
TO authenticated
USING (true);

INSERT INTO public.role_permissions (role, page_key, can_access) VALUES
  ('admin', 'dashboard', true),
  ('admin', 'analytics', true),
  ('admin', 'customers', true),
  ('admin', 'users', true),
  ('admin', 'roles', true),
  ('admin', 'orders', true),
  ('admin', 'shipments', true),
  ('admin', 'messaging', true),
  ('admin', 'refunds', true),
  ('admin', 'transactions', true),
  ('admin', 'wallets', true),
  ('admin', 'notifications', true),
  ('admin', 'wishlist', true),
  ('admin', 'marketing', true),
  ('admin', 'settings', true),
  ('admin', 'permissions', true),
  ('employee', 'dashboard', true),
  ('employee', 'orders', true),
  ('employee', 'shipments', true),
  ('employee', 'customers', true),
  ('moderator', 'dashboard', true),
  ('moderator', 'orders', true),
  ('moderator', 'messaging', true);
