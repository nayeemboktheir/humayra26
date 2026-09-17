-- TradeOn Global — parity check for the self-hosted stack.
-- Run against the NEW database after loading. Every FAIL is a blocker.
--
--   psql "$DB_URL" -f verify.sql
--
-- Expected values are production as of the 2026-09-17 snapshot (see MANIFEST.md).
-- If you re-snapshot, update both files together or this check is meaningless.

\pset format aligned
\echo '=== object parity ==='

WITH expected(item, want) AS (VALUES
  ('tables',        18),
  ('functions',     12),
  ('triggers',      13),
  ('policies',      64),
  ('rls_enabled',   18),
  ('indexes',       13),
  ('cron_jobs',      8),
  ('buckets',        2)
), actual(item, got) AS (VALUES
  ('tables',      (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE')),
  ('functions',   (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname NOT LIKE 'import_auth_%' AND p.proname <> 'set_import_mode')),
  ('triggers',    (SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname IN ('public','auth'))),
  ('policies',    (SELECT count(*)::int FROM pg_policies WHERE schemaname='public')),
  ('rls_enabled', (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity)),
  ('indexes',     (SELECT count(*)::int FROM pg_indexes WHERE schemaname='public' AND indexname NOT IN (SELECT conname FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND con.contype IN ('p','u')))),
  ('cron_jobs',   (SELECT count(*)::int FROM cron.job)),
  ('buckets',     (SELECT count(*)::int FROM storage.buckets))
)
SELECT e.item, e.want, a.got,
       CASE WHEN e.want = a.got THEN 'ok' ELSE 'FAIL' END AS result
FROM expected e JOIN actual a USING (item)
ORDER BY e.item;

\echo ''
\echo '=== row parity (search_cache excluded on purpose: it self-rebuilds) ==='

WITH expected(t, want) AS (VALUES
  ('auth.users',        724), ('auth.identities',   724),
  ('admin_messages',     21), ('app_settings',       31),
  ('cart_items',       1921), ('category_products', 420),
  ('notifications',    3312), ('orders',            906),
  ('phone_otps',       1077), ('profiles',          724),
  ('refunds',             0), ('role_permissions',   52),
  ('shipments',        1576), ('sms_logs',         3964),
  ('transactions',      330), ('trending_products',  15),
  ('user_roles',          3), ('wallets',           724),
  ('wishlist',          816)
), actual(t, got) AS (
  SELECT 'auth.users',        count(*)::int FROM auth.users
  UNION ALL SELECT 'auth.identities',   count(*)::int FROM auth.identities
  UNION ALL SELECT 'admin_messages',    count(*)::int FROM public.admin_messages
  UNION ALL SELECT 'app_settings',      count(*)::int FROM public.app_settings
  UNION ALL SELECT 'cart_items',        count(*)::int FROM public.cart_items
  UNION ALL SELECT 'category_products', count(*)::int FROM public.category_products
  UNION ALL SELECT 'notifications',     count(*)::int FROM public.notifications
  UNION ALL SELECT 'orders',            count(*)::int FROM public.orders
  UNION ALL SELECT 'phone_otps',        count(*)::int FROM public.phone_otps
  UNION ALL SELECT 'profiles',          count(*)::int FROM public.profiles
  UNION ALL SELECT 'refunds',           count(*)::int FROM public.refunds
  UNION ALL SELECT 'role_permissions',  count(*)::int FROM public.role_permissions
  UNION ALL SELECT 'shipments',         count(*)::int FROM public.shipments
  UNION ALL SELECT 'sms_logs',          count(*)::int FROM public.sms_logs
  UNION ALL SELECT 'transactions',      count(*)::int FROM public.transactions
  UNION ALL SELECT 'trending_products', count(*)::int FROM public.trending_products
  UNION ALL SELECT 'user_roles',        count(*)::int FROM public.user_roles
  UNION ALL SELECT 'wallets',           count(*)::int FROM public.wallets
  UNION ALL SELECT 'wishlist',          count(*)::int FROM public.wishlist
)
SELECT e.t AS table_name, e.want, a.got, (a.got - e.want) AS drift,
       CASE WHEN e.want = a.got THEN 'ok' ELSE 'FAIL' END AS result
FROM expected e JOIN actual a USING (t)
ORDER BY result DESC, e.t;

\echo ''
\echo '=== password hashes (the one assumption worth failing loudly on) ==='
SELECT count(*) AS users,
       count(*) FILTER (WHERE encrypted_password LIKE '$2a$%') AS bcrypt_2a,
       count(*) FILTER (WHERE encrypted_password IS NULL OR encrypted_password = '') AS empty_pw,
       CASE WHEN count(*) = count(*) FILTER (WHERE encrypted_password LIKE '$2a$%')
            THEN 'ok' ELSE 'FAIL' END AS result
FROM auth.users;

\echo ''
\echo '=== orphans (FKs are in place, so any row here means a load-order bug) ==='
SELECT 'orders'    AS t, count(*) AS orphans FROM public.orders o    WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = o.user_id)
UNION ALL SELECT 'shipments',    count(*) FROM public.shipments s    WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = s.user_id)
UNION ALL SELECT 'profiles',     count(*) FROM public.profiles p     WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.user_id)
UNION ALL SELECT 'wallets',      count(*) FROM public.wallets w      WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = w.user_id)
UNION ALL SELECT 'transactions', count(*) FROM public.transactions x WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = x.user_id);

\echo ''
\echo '=== duplicate profiles/wallets (non-zero means the auth.users triggers'
\echo '    were live during the auth load — see load.sh) ==='
SELECT (SELECT count(*) FROM (SELECT user_id FROM public.profiles GROUP BY user_id HAVING count(*) > 1) d) AS dup_profiles,
       (SELECT count(*) FROM (SELECT user_id FROM public.wallets  GROUP BY user_id HAVING count(*) > 1) d) AS dup_wallets;

\echo ''
\echo '=== leftover import RPCs (must be zero before this stack goes live) ==='
SELECT count(*) AS import_rpcs_still_installed
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (p.proname LIKE 'import_auth_%' OR p.proname = 'set_import_mode');

\echo ''
\echo '=== import mode must be OFF: all three triggers enabled (tgenabled = O) ==='
SELECT c.relname, t.tgname, t.tgenabled,
       CASE WHEN t.tgenabled = 'O' THEN 'ok' ELSE 'FAIL' END AS result
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
WHERE t.tgname IN ('on_auth_user_created', 'on_auth_user_created_wallet', 'trigger_auto_create_shipment')
ORDER BY c.relname, t.tgname;
