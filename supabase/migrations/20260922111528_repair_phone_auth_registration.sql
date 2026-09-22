-- Canonical Bangladesh phone format used by auth and indexed profile lookups.
CREATE OR REPLACE FUNCTION public.normalize_bd_phone(input_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
DECLARE
  digits text := regexp_replace(input_phone, '[^0-9]', '', 'g');
BEGIN
  IF digits LIKE '0%' THEN
    digits := '880' || substr(digits, 2);
  ELSIF digits NOT LIKE '880%' THEN
    digits := '880' || digits;
  END IF;

  IF digits ~ '^8801[0-9]{9}$' THEN
    RETURN digits;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_bd_phone(text) FROM PUBLIC;

-- Abort before changing data if two users would own the same canonical phone.
DO $$
DECLARE
  duplicate_phones text;
BEGIN
  WITH proposed AS (
    SELECT
      u.id AS user_id,
      COALESCE(
        public.normalize_bd_phone(NULLIF(p.phone, '')),
        public.normalize_bd_phone(NULLIF(u.raw_user_meta_data->>'phone', ''))
      ) AS phone
    FROM auth.users AS u
    LEFT JOIN public.profiles AS p ON p.user_id = u.id
  ), duplicates AS (
    SELECT phone
    FROM proposed
    WHERE phone IS NOT NULL
    GROUP BY phone
    HAVING count(DISTINCT user_id) > 1
  )
  SELECT string_agg(phone, ', ' ORDER BY phone)
  INTO duplicate_phones
  FROM duplicates;

  IF duplicate_phones IS NOT NULL THEN
    RAISE EXCEPTION 'Duplicate normalized profile phones require manual review: %', duplicate_phones;
  END IF;
END;
$$;

-- Restore profiles that are missing, then normalize/backfill phone links.
INSERT INTO public.profiles (user_id, full_name, phone)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'full_name', ''),
  public.normalize_bd_phone(NULLIF(u.raw_user_meta_data->>'phone', ''))
FROM auth.users AS u
LEFT JOIN public.profiles AS p ON p.user_id = u.id
WHERE p.user_id IS NULL;

UPDATE public.profiles AS p
SET
  full_name = COALESCE(NULLIF(p.full_name, ''), NULLIF(u.raw_user_meta_data->>'full_name', ''), ''),
  phone = COALESCE(
    public.normalize_bd_phone(NULLIF(p.phone, '')),
    public.normalize_bd_phone(NULLIF(u.raw_user_meta_data->>'phone', ''))
  )
FROM auth.users AS u
WHERE u.id = p.user_id
  AND (
    p.full_name IS DISTINCT FROM COALESCE(NULLIF(p.full_name, ''), NULLIF(u.raw_user_meta_data->>'full_name', ''), '')
    OR p.phone IS DISTINCT FROM COALESCE(
      public.normalize_bd_phone(NULLIF(p.phone, '')),
      public.normalize_bd_phone(NULLIF(u.raw_user_meta_data->>'phone', ''))
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique_nonempty_idx
  ON public.profiles (phone)
  WHERE phone IS NOT NULL AND phone <> '';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    public.normalize_bd_phone(NULLIF(NEW.raw_user_meta_data->>'phone', ''))
  )
  ON CONFLICT (user_id) DO UPDATE
    SET full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.profiles.full_name),
        phone = COALESCE(EXCLUDED.phone, public.profiles.phone);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS policies are intentionally unchanged. Edge Functions use service-role access.
