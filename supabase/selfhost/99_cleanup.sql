-- TradeOn Global — drop the temporary auth import bridge.
-- Run immediately after the data load and verify pass. Not optional.
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f 99_cleanup.sql
--
-- import_auth_users / import_auth_identities are SECURITY DEFINER functions that
-- write auth.users. They are granted only to service_role, but leaving them
-- installed means any future service_role key leak becomes account creation
-- rather than just data access. verify.sql fails while they still exist.

BEGIN;

-- Belt and braces: if the transfer aborted midway, import mode may still be on
-- and new signups would silently get no profile and no wallet.
SELECT public.set_import_mode(false);

DROP FUNCTION IF EXISTS public.import_auth_users(jsonb);
DROP FUNCTION IF EXISTS public.import_auth_identities(jsonb);
DROP FUNCTION IF EXISTS public.set_import_mode(boolean);

COMMIT;

SELECT count(*) AS should_be_zero
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (p.proname LIKE 'import_auth_%' OR p.proname = 'set_import_mode');

-- All three triggers must be back to 'O' (enabled).
SELECT c.relname, t.tgname, t.tgenabled
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
WHERE t.tgname IN ('on_auth_user_created', 'on_auth_user_created_wallet', 'trigger_auto_create_shipment');
