
-- 1. Admin messages table for customer messaging
CREATE TABLE public.admin_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  sent_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all messages" ON public.admin_messages FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view own messages" ON public.admin_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own messages" ON public.admin_messages FOR UPDATE USING (auth.uid() = user_id);

-- 2. App settings table for currency rate and other configs
CREATE TABLE public.app_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read settings" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "Admins can manage settings" ON public.app_settings FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default currency rate
INSERT INTO public.app_settings (key, value) VALUES ('cny_to_bdt_rate', '17.5');

-- 3. Trigger: Auto-create shipment when order is inserted
CREATE OR REPLACE FUNCTION public.auto_create_shipment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.shipments (user_id, order_id, status)
  VALUES (NEW.user_id, NEW.id, 'Ordered');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_auto_create_shipment
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_shipment();

-- 4. Trigger: Auto-notify customer when shipment status changes
CREATE OR REPLACE FUNCTION public.auto_notify_shipment_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
$$;

CREATE TRIGGER trigger_notify_shipment_change
AFTER UPDATE ON public.shipments
FOR EACH ROW
EXECUTE FUNCTION public.auto_notify_shipment_change();

-- 5. Trigger: Auto-notify customer when order status changes
CREATE OR REPLACE FUNCTION public.auto_notify_order_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
$$;

CREATE TRIGGER trigger_notify_order_change
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.auto_notify_order_change();
