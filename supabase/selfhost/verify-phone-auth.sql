-- Read-only verification after 20260922111528_repair_phone_auth_registration.sql.
-- Every count in the first three result sets must be zero.

SELECT count(*) AS missing_profiles
FROM auth.users AS u
LEFT JOIN public.profiles AS p ON p.user_id = u.id
WHERE p.user_id IS NULL;

SELECT count(*) AS missing_phone_links
FROM auth.users AS u
JOIN public.profiles AS p ON p.user_id = u.id
WHERE public.normalize_bd_phone(NULLIF(u.raw_user_meta_data->>'phone', '')) IS NOT NULL
  AND p.phone IS NULL;

SELECT phone, count(*) AS owners
FROM public.profiles
WHERE phone IS NOT NULL AND phone <> ''
GROUP BY phone
HAVING count(*) > 1;

SELECT
  t.tgname AS trigger_name,
  p.proname AS function_name,
  NOT t.tgisinternal AS enabled_user_trigger
FROM pg_trigger AS t
JOIN pg_proc AS p ON p.oid = t.tgfoid
WHERE t.tgrelid = 'auth.users'::regclass
  AND t.tgname = 'on_auth_user_created';

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'profiles'
  AND indexname = 'profiles_phone_unique_nonempty_idx';

SELECT relname, relrowsecurity
FROM pg_class
WHERE oid IN ('public.profiles'::regclass, 'public.phone_otps'::regclass);

SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'phone_otps')
ORDER BY tablename, policyname;

