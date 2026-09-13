CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','moderator','employee')
  )
$$;

DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
CREATE POLICY "Staff can view all orders" ON public.orders
FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins can update all orders" ON public.orders;
CREATE POLICY "Staff can update all orders" ON public.orders
FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins can view all shipments" ON public.shipments;
CREATE POLICY "Staff can view all shipments" ON public.shipments
FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins can update all shipments" ON public.shipments;
CREATE POLICY "Staff can update all shipments" ON public.shipments
FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert shipments" ON public.shipments;
CREATE POLICY "Staff can insert shipments" ON public.shipments
FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));