GRANT SELECT ON public.app_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

DROP POLICY IF EXISTS "Anyone can read settings" ON public.app_settings;
DROP POLICY IF EXISTS "Public can read non-sensitive settings" ON public.app_settings;

CREATE POLICY "Public can read non-sensitive settings"
ON public.app_settings
FOR SELECT
USING (
  key NOT IN (
    'meta_capi_token',
    'meta_test_event_code',
    'bulksms_bd_api_key',
    'bulksms_bd_sender_id'
  )
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);