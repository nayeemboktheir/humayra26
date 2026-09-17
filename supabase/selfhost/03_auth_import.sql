-- TradeOn Global — temporary auth import RPCs for the self-hosted stack.
--
-- PostgREST only exposes the public schema, so auth.users and auth.identities
-- cannot be written over the REST API directly. These two SECURITY DEFINER
-- functions are the bridge: the transfer step POSTs batches of rows to
-- /rest/v1/rpc/import_auth_users and /rest/v1/rpc/import_auth_identities with
-- the service_role key.
--
-- They are granted to service_role ONLY, and 99_cleanup.sql drops them. Do not
-- leave them installed — a SECURITY DEFINER function that writes auth.users is
-- exactly the thing you do not want sitting in a production schema.
--
-- Source shape (verified 2026-09-17): 724 users, every password a $2a$ bcrypt
-- hash, one provider ('email'), 724 identities, no MFA factors, no SSO users.
-- Hashes are copied verbatim so existing passwords keep working.
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f 03_auth_import.sql

BEGIN;

CREATE OR REPLACE FUNCTION public.import_auth_users(payload jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  n integer;
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    invited_at, confirmation_sent_at, recovery_sent_at, email_change,
    email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    is_super_admin, created_at, updated_at, phone, phone_confirmed_at,
    phone_change, phone_change_sent_at, email_change_confirm_status,
    banned_until, reauthentication_sent_at, is_sso_user, deleted_at, is_anonymous,
    -- GoTrue treats these token columns as NOT NULL-ish; empty string is the
    -- value it writes itself for "no token outstanding". Copying NULLs here
    -- makes some GoTrue versions error on the next sign-in.
    confirmation_token, recovery_token, email_change_token_new,
    email_change_token_current, reauthentication_token
  )
  SELECT
    COALESCE((r->>'instance_id')::uuid, '00000000-0000-0000-0000-000000000000'::uuid),
    (r->>'id')::uuid,
    COALESCE(r->>'aud', 'authenticated'),
    COALESCE(r->>'role', 'authenticated'),
    r->>'email',
    r->>'encrypted_password',
    (r->>'email_confirmed_at')::timestamptz,
    (r->>'invited_at')::timestamptz,
    (r->>'confirmation_sent_at')::timestamptz,
    (r->>'recovery_sent_at')::timestamptz,
    COALESCE(r->>'email_change', ''),
    (r->>'email_change_sent_at')::timestamptz,
    (r->>'last_sign_in_at')::timestamptz,
    COALESCE((r->'raw_app_meta_data')::jsonb, '{}'::jsonb),
    COALESCE((r->'raw_user_meta_data')::jsonb, '{}'::jsonb),
    COALESCE((r->>'is_super_admin')::boolean, false),
    (r->>'created_at')::timestamptz,
    (r->>'updated_at')::timestamptz,
    r->>'phone',
    (r->>'phone_confirmed_at')::timestamptz,
    r->>'phone_change',
    (r->>'phone_change_sent_at')::timestamptz,
    COALESCE((r->>'email_change_confirm_status')::smallint, 0),
    (r->>'banned_until')::timestamptz,
    (r->>'reauthentication_sent_at')::timestamptz,
    COALESCE((r->>'is_sso_user')::boolean, false),
    (r->>'deleted_at')::timestamptz,
    COALESCE((r->>'is_anonymous')::boolean, false),
    COALESCE(r->>'confirmation_token', ''),
    COALESCE(r->>'recovery_token', ''),
    COALESCE(r->>'email_change_token_new', ''),
    COALESCE(r->>'email_change_token_current', ''),
    COALESCE(r->>'reauthentication_token', '')
  FROM jsonb_array_elements(payload) AS r
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.import_auth_identities(payload jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  n integer;
BEGIN
  INSERT INTO auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at,
    created_at, updated_at, email, id
  )
  SELECT
    r->>'provider_id',
    (r->>'user_id')::uuid,
    COALESCE((r->'identity_data')::jsonb, '{}'::jsonb),
    r->>'provider',
    (r->>'last_sign_in_at')::timestamptz,
    (r->>'created_at')::timestamptz,
    (r->>'updated_at')::timestamptz,
    r->>'email',
    COALESCE((r->>'id')::uuid, gen_random_uuid())
  FROM jsonb_array_elements(payload) AS r
  ON CONFLICT (provider_id, provider) DO NOTHING;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$function$;

-- Import mode. Three triggers corrupt a bulk load if they are left live:
--
--   on_auth_user_created         -> inserts a profile for every auth.users row
--   on_auth_user_created_wallet  -> inserts a wallet  for every auth.users row
--   trigger_auto_create_shipment -> inserts a shipment for every orders row
--
-- Leave them on and you get 724 duplicate profiles, 724 duplicate wallets and
-- 906 phantom shipments on top of the 1,576 real ones being loaded.
--
-- ALTER TABLE ... DISABLE TRIGGER needs table ownership, which the REST API has
-- no way to express, so this wraps it as an RPC the transfer step can call with
-- the service_role key. Dropped by 99_cleanup.sql along with the importers.
CREATE OR REPLACE FUNCTION public.set_import_mode(enabled boolean)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF enabled THEN
    ALTER TABLE auth.users   DISABLE TRIGGER on_auth_user_created;
    ALTER TABLE auth.users   DISABLE TRIGGER on_auth_user_created_wallet;
    ALTER TABLE public.orders DISABLE TRIGGER trigger_auto_create_shipment;
    RETURN 'import mode ON - 3 triggers disabled';
  ELSE
    ALTER TABLE auth.users   ENABLE TRIGGER on_auth_user_created;
    ALTER TABLE auth.users   ENABLE TRIGGER on_auth_user_created_wallet;
    ALTER TABLE public.orders ENABLE TRIGGER trigger_auto_create_shipment;
    RETURN 'import mode OFF - 3 triggers re-enabled';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.import_auth_users(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.import_auth_identities(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_import_mode(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_auth_users(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.import_auth_identities(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_import_mode(boolean) TO service_role;

COMMIT;
