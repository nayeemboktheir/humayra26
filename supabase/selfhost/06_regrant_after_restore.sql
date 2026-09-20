-- Re-establishes PostgREST role privileges after a --force restore.
--
-- restore.sh's --force path runs `drop schema public cascade; create schema public;`
-- before restoring. That gives the schema a new OID, which silently orphans whatever
-- `ALTER DEFAULT PRIVILEGES ... IN SCHEMA public` wiring the original schema had — that
-- wiring is what let every table created by 01_schema.sql/02_functions_rls.sql inherit
-- anon/authenticated/service_role access automatically, without either file ever needing
-- an explicit GRANT.
--
-- pg_restore is then run with --no-privileges (deliberately — the dump's own GRANTs
-- target the source project's roles, which do not exist here and would error). The result:
-- after a --force restore, PostgREST returns 403 "permission denied" for every table, for
-- every role, including service_role — not an RLS problem, no privilege to attempt the
-- operation at all. Confirmed after the 2026-09-20 production cutover restore: all 11
-- tables probed returned 42501, both anon-level and service_role.
--
-- This mirrors the supabase/postgres image's own first-boot bootstrap. Safe to run
-- repeatedly. RLS (18 tables, 64 policies, unaffected by this) still governs what
-- anon/authenticated can see; service_role continues to bypass RLS by design, exactly as
-- before the restore — this only restores its ability to reach the tables in the first
-- place.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

-- So the NEXT restore's newly-created tables inherit access again too, same as before.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- Verification: expect 0 rows. Anything listed here still cannot be SELECTed by
-- service_role, which is the exact symptom this file fixes.
select table_name
from information_schema.tables t
where table_schema = 'public' and table_type = 'BASE TABLE'
  and not exists (
    select 1 from information_schema.table_privileges p
    where p.table_schema = 'public' and p.table_name = t.table_name
      and p.grantee = 'service_role' and p.privilege_type = 'SELECT'
  );
