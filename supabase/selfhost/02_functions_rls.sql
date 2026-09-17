-- TradeOn Global — functions, triggers, RLS and policies, introspected from the
-- live Lovable-managed production database on 2026-09-17.
-- Run after 01_schema.sql, before loading data.
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f 02_functions_rls.sql
--
-- Production parity target for this file: 12 functions, 13 triggers
-- (11 on public tables + 2 on auth.users), 64 policies, RLS on all 18 tables.

BEGIN;

-- ---------------------------------------------------------------- functions

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','moderator','employee')
  )
$function$;

-- The single role resolver behind src/lib/roles.ts.
CREATE OR REPLACE FUNCTION public.get_my_role()
 RETURNS public.app_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.get_user_emails()
 RETURNS TABLE(user_id uuid, email text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id as user_id, email::text FROM auth.users;
$function$;

CREATE OR REPLACE FUNCTION public.get_category_products(_limit_per_category integer DEFAULT 12)
 RETURNS TABLE(category_query text, product_id text, title text, image_url text, price numeric, sales integer, detail_url text, location text, vendor_name text, stock integer, weight numeric, extra_images text[])
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT category_query, product_id, title, image_url, price, sales,
         detail_url, location, vendor_name, stock, weight, extra_images
  FROM (
    SELECT cp.*,
           ROW_NUMBER() OVER (PARTITION BY cp.category_query ORDER BY cp.created_at ASC) AS rn
    FROM public.category_products cp
  ) ranked
  WHERE rn <= GREATEST(_limit_per_category, 1)
  ORDER BY category_query, rn
$function$;

CREATE OR REPLACE FUNCTION public.get_shipment_stage_counts()
 RETURNS TABLE(status text, count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT s.status, count(*)::bigint
  FROM public.shipments s
  GROUP BY s.status
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'phone', '')
  )
  ON CONFLICT (user_id) DO UPDATE
    SET full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.profiles.full_name),
        phone = COALESCE(public.profiles.phone, EXCLUDED.phone);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_wallet()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.wallets (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_create_shipment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.shipments (user_id, order_id, status)
  VALUES (NEW.user_id, NEW.id, 'Ordered');
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_notify_order_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (
      NEW.user_id,
      'Order Update',
      'Your order #' || NEW.order_number || ' status changed to: ' || NEW.status,
      'order'
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_notify_shipment_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (
      NEW.user_id,
      'Shipment Update',
      'Your shipment status has been updated to: ' || NEW.status,
      'shipment'
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------------- triggers

CREATE TRIGGER update_category_products_updated_at BEFORE UPDATE ON public.category_products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_refunds_updated_at BEFORE UPDATE ON public.refunds FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_search_cache_updated_at BEFORE UPDATE ON public.search_cache FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_shipments_updated_at BEFORE UPDATE ON public.shipments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_trending_products_updated_at BEFORE UPDATE ON public.trending_products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_wallets_updated_at BEFORE UPDATE ON public.wallets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trigger_auto_create_shipment AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.auto_create_shipment();
CREATE TRIGGER trigger_notify_order_change AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.auto_notify_order_change();
CREATE TRIGGER trigger_notify_shipment_change AFTER UPDATE ON public.shipments FOR EACH ROW EXECUTE FUNCTION public.auto_notify_shipment_change();

-- These two fire on every auth.users INSERT and will double-create profiles and
-- wallets that the data load also inserts. load.sh disables them for the auth
-- load and re-enables them afterwards; do not drop them.
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
CREATE TRIGGER on_auth_user_created_wallet AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_wallet();

-- --------------------------------------------------------------------- RLS

ALTER TABLE public.admin_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trending_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlist ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------- policies

CREATE POLICY "Admins can manage all messages" ON public.admin_messages AS PERMISSIVE FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can send own messages" ON public.admin_messages AS PERMISSIVE FOR INSERT TO public WITH CHECK (((auth.uid() = user_id) AND (auth.uid() = sent_by) AND (sender_role = 'user'::text)));
CREATE POLICY "Users can update own messages" ON public.admin_messages AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view own messages" ON public.admin_messages AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));

CREATE POLICY "Admins can manage settings" ON public.app_settings AS PERMISSIVE FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Public can read non-sensitive settings" ON public.app_settings AS PERMISSIVE FOR SELECT TO public USING (((key <> ALL (ARRAY['meta_capi_token'::text, 'meta_test_event_code'::text, 'bulksms_bd_api_key'::text, 'bulksms_bd_sender_id'::text])) OR has_role(auth.uid(), 'admin'::app_role)));

CREATE POLICY "Admins can manage all cart items" ON public.cart_items AS PERMISSIVE FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can add to cart" ON public.cart_items AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can delete own cart" ON public.cart_items AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can update own cart" ON public.cart_items AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view own cart" ON public.cart_items AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));

CREATE POLICY "Category products are publicly readable" ON public.category_products AS PERMISSIVE FOR SELECT TO public USING (true);

CREATE POLICY "Admins can delete notifications" ON public.notifications AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert notifications" ON public.notifications AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view all notifications" ON public.notifications AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can update own notifications" ON public.notifications AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view own notifications" ON public.notifications AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));

CREATE POLICY "Admins can delete orders" ON public.orders AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Staff can update all orders" ON public.orders AS PERMISSIVE FOR UPDATE TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
CREATE POLICY "Staff can view all orders" ON public.orders AS PERMISSIVE FOR SELECT TO authenticated USING (is_staff(auth.uid()));
CREATE POLICY "Users can insert own orders" ON public.orders AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can view own orders" ON public.orders AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));

CREATE POLICY "Service role can manage phone_otps" ON public.phone_otps AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));

CREATE POLICY "Admins can delete profiles" ON public.profiles AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update all profiles" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view all profiles" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can insert own profile" ON public.profiles AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view own profile" ON public.profiles AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));

CREATE POLICY "Admins can delete refunds" ON public.refunds AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update all refunds" ON public.refunds AS PERMISSIVE FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view all refunds" ON public.refunds AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can request refunds" ON public.refunds AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can view own refunds" ON public.refunds AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));

CREATE POLICY "Admins can manage role permissions" ON public.role_permissions AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can read role permissions" ON public.role_permissions AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Search cache is publicly readable" ON public.search_cache AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Service role can manage search cache" ON public.search_cache AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));

CREATE POLICY "Admins can delete shipments" ON public.shipments AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Staff can insert shipments" ON public.shipments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));
CREATE POLICY "Staff can update all shipments" ON public.shipments AS PERMISSIVE FOR UPDATE TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
CREATE POLICY "Staff can view all shipments" ON public.shipments AS PERMISSIVE FOR SELECT TO authenticated USING (is_staff(auth.uid()));
CREATE POLICY "Users can view own shipments" ON public.shipments AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));

CREATE POLICY "Admins can delete sms logs" ON public.sms_logs AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert sms logs" ON public.sms_logs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update sms logs" ON public.sms_logs AS PERMISSIVE FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view all sms logs" ON public.sms_logs AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete transactions" ON public.transactions AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert transactions" ON public.transactions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update transactions" ON public.transactions AS PERMISSIVE FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view all transactions" ON public.transactions AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view own transactions" ON public.transactions AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));

CREATE POLICY "Service role can manage trending products" ON public.trending_products AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "Trending products are publicly readable" ON public.trending_products AS PERMISSIVE FOR SELECT TO public USING (true);

CREATE POLICY "Admins can manage roles" ON public.user_roles AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view all roles" ON public.user_roles AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update wallets" ON public.wallets AS PERMISSIVE FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view all wallets" ON public.wallets AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view own wallet" ON public.wallets AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));

CREATE POLICY "Admins can delete wishlist items" ON public.wishlist AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view all wishlist" ON public.wishlist AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can add to wishlist" ON public.wishlist AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can remove from wishlist" ON public.wishlist AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view own wishlist" ON public.wishlist AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));

-- ------------------------------------------------------------------ storage
-- Both buckets are public with no size or MIME restriction, matching production.
-- They are created EMPTY on purpose. temp-images holds 16,273 objects / 627 MB
-- in production, but every one of them is a leaked scratch upload:
-- alibaba-1688-image-search schedules its own deletion with a setTimeout that
-- never survives the request. No row in any table references a storage URL.
INSERT INTO storage.buckets (id, name, public)
VALUES ('temp-images', 'temp-images', true), ('image-search', 'image-search', true)
ON CONFLICT (id) DO NOTHING;

COMMIT;
