-- Update trigger to also copy phone from signup metadata
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

-- Backfill existing profiles with phone from auth metadata
UPDATE public.profiles p
SET phone = u.raw_user_meta_data->>'phone'
FROM auth.users u
WHERE u.id = p.user_id
  AND (p.phone IS NULL OR p.phone = '')
  AND u.raw_user_meta_data->>'phone' IS NOT NULL
  AND u.raw_user_meta_data->>'phone' != '';