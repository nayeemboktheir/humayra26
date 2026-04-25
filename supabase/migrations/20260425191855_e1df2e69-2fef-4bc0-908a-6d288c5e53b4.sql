
CREATE TABLE IF NOT EXISTS public.sms_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  message text NOT NULL,
  sms_type text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'sent',
  response text,
  user_id uuid,
  sent_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all sms logs"
  ON public.sms_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert sms logs"
  ON public.sms_logs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update sms logs"
  ON public.sms_logs FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete sms logs"
  ON public.sms_logs FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS sms_logs_created_at_idx ON public.sms_logs(created_at DESC);

INSERT INTO public.role_permissions (role, page_key, can_access) VALUES
  ('admin', 'sms', true),
  ('moderator', 'sms', true),
  ('employee', 'sms', false),
  ('user', 'sms', false)
ON CONFLICT DO NOTHING;
