#!/usr/bin/env bash
# Restore the Lovable pg_dump into the self-hosted Supabase stack.
#
# Run this ON THE VPS. Postgres is not publicly exposed (correctly), so the
# restore has to happen next to the container.
#
#   scp "humayra26_260917.backup" root@<vps>:/root/
#   scp restore.sh root@<vps>:/root/
#   ssh root@<vps>
#   chmod +x restore.sh
#   ./restore.sh /root/humayra26_260917.backup supabase-db-emhbzh3hwap5rmq6ysysloil
#
# This procedure was rehearsed end to end against the real dump on
# supabase/postgres:17.6.1.169 + gotrue v2.186.0. See restore.md for why each
# pass exists — every one of them is there because skipping it failed.
#
# Safe to re-run: it refuses to touch a database that already has data unless
# you pass --force, and --force drops and recreates the public schema only.

set -euo pipefail

DUMP="${1:?usage: restore.sh <dump-file> <db-container> [--force]}"
CONTAINER="${2:?usage: restore.sh <dump-file> <db-container> [--force]}"
FORCE="${3:-}"

# search_cache is 43,190 rows / 210 MB of a 258 MB database and rebuilds itself
# from TMAPI. Set RESTORE_SEARCH_CACHE=1 if you really want it.
RESTORE_SEARCH_CACHE="${RESTORE_SEARCH_CACHE:-0}"

psql_() { docker exec -i "$CONTAINER" psql -U postgres -d postgres "$@"; }
say()   { printf '\n\033[1m== %s\033[0m\n' "$*"; }

# ----------------------------------------------------------------- preflight
say "Preflight"

[ -f "$DUMP" ] || { echo "no such dump file: $DUMP"; exit 1; }
docker inspect "$CONTAINER" >/dev/null 2>&1 || { echo "no such container: $CONTAINER"; exit 1; }

PGVER=$(psql_ -tAc "show server_version;" | tr -d '\r')
echo "target server_version: $PGVER"
case "$PGVER" in
  17.*) ;;
  *) echo "REFUSING: the dump is from PostgreSQL 17.6 and will not restore into $PGVER."; exit 1 ;;
esac

# supabase/postgres ships a stub auth schema (5 tables, no email_confirmed_at).
# The real one is created by GoTrue at boot. If GoTrue has not migrated yet,
# the auth restore fails halfway and leaves a mess.
HAS_ECA=$(psql_ -tAc "select count(*) from information_schema.columns where table_schema='auth' and table_name='users' and column_name='email_confirmed_at';" | tr -d '\r')
if [ "$HAS_ECA" != "1" ]; then
  echo "REFUSING: auth.users has no email_confirmed_at column, so GoTrue has not"
  echo "migrated the auth schema yet. Start the full stack, wait for supabase-auth"
  echo "to report healthy, then re-run."
  exit 1
fi
echo "auth schema: migrated by GoTrue ($(psql_ -tAc "select count(*) from pg_tables where schemaname='auth';" | tr -d '\r') tables)"

EXISTING=$(psql_ -tAc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';" | tr -d '\r')
if [ "$EXISTING" != "0" ]; then
  if [ "$FORCE" = "--force" ]; then
    echo "public schema has $EXISTING tables; --force given, dropping and recreating"
    psql_ -v ON_ERROR_STOP=1 -q -c "drop schema public cascade; create schema public;
      grant usage on schema public to anon, authenticated, service_role;
      grant all on schema public to postgres;"
    psql_ -v ON_ERROR_STOP=1 -q -c "truncate auth.users cascade;"
  else
    echo "REFUSING: public schema already has $EXISTING tables. Re-run with --force"
    echo "to drop and recreate public (and truncate auth.users) before restoring."
    exit 1
  fi
fi

say "Copying dump into the container ($(du -h "$DUMP" | cut -f1))"
docker cp "$DUMP" "$CONTAINER:/tmp/restore.backup"

say "Reading archive TOC"
docker exec "$CONTAINER" pg_restore -l /tmp/restore.backup > /tmp/toc.txt
echo "$(wc -l < /tmp/toc.txt) TOC lines"
grep -m1 "Dumped from database version" /tmp/toc.txt || true

# ------------------------------------------------------------- build lists
# Which auth tables actually exist here? Lovable runs a newer GoTrue than
# v2.186.0 (27 auth tables vs 20), so the dump carries tables this stack has
# never heard of: scim_*, webauthn_*, mfa_recovery_*, custom_oauth_providers.
# All are empty in production, so skipping them loses nothing.
psql_ -tAc "select tablename from pg_tables where schemaname='auth';" | tr -d '\r' | sort > /tmp/target_auth.txt

grep "TABLE DATA auth " /tmp/toc.txt \
  | grep -vE "auth (schema_migrations|audit_log_entries|one_time_tokens)" \
  > /tmp/auth_all.txt

: > /tmp/p1_users.txt; : > /tmp/p2_auth.txt; : > /tmp/p3_sessions.txt
while read -r line; do
  tbl=$(awk '{print $(NF-1)}' <<<"$line")
  grep -qx "$tbl" /tmp/target_auth.txt || { echo "  skip (absent here): auth.$tbl"; continue; }
  case "$tbl" in
    users)                        echo "$line" >> /tmp/p1_users.txt ;;
    refresh_tokens|mfa_amr_claims) echo "$line" >> /tmp/p3_sessions.txt ;;
    *)                            echo "$line" >> /tmp/p2_auth.txt ;;
  esac
done < /tmp/auth_all.txt

grep -E "; [0-9]+ [0-9]+ .* public " /tmp/toc.txt > /tmp/p4_public.txt
if [ "$RESTORE_SEARCH_CACHE" != "1" ]; then
  grep -v "TABLE DATA public search_cache" /tmp/p4_public.txt > /tmp/p4_public.tmp
  mv /tmp/p4_public.tmp /tmp/p4_public.txt
  echo "  excluding search_cache data (set RESTORE_SEARCH_CACHE=1 to include)"
fi

# These call public.handle_new_user / handle_new_wallet, so they can only be
# created after pass 4. They are also AFTER INSERT row triggers and COPY fires
# row triggers -- create them earlier and you get 724 duplicate profiles and
# 724 duplicate wallets.
grep "TRIGGER auth users " /tmp/toc.txt > /tmp/p5_triggers.txt

for f in p1_users p2_auth p3_sessions p4_public p5_triggers; do
  docker cp "/tmp/$f.txt" "$CONTAINER:/tmp/$f.txt" >/dev/null
done

run_pass() {
  local label="$1" list="$2"; shift 2
  local n; n=$(wc -l < "/tmp/$list.txt")
  say "$label ($n entries)"
  [ "$n" -eq 0 ] && { echo "  nothing to do"; return 0; }
  docker exec "$CONTAINER" pg_restore -U postgres -d postgres \
    -L "/tmp/$list.txt" --no-owner --no-privileges "$@" /tmp/restore.backup \
    2>&1 | grep -E "error|warning" | head -10 || true
}

# ---------------------------------------------------------------- the passes
run_pass "PASS 1/5  auth.users"                 p1_users     --data-only
echo "  auth.users = $(psql_ -tAc 'select count(*) from auth.users;' | tr -d '\r')"

run_pass "PASS 2/5  remaining auth data"        p2_auth      --data-only
run_pass "PASS 3/5  session-dependent auth"     p3_sessions  --data-only
run_pass "PASS 4/5  public schema + data"       p4_public
run_pass "PASS 5/5  auth.users triggers"        p5_triggers

# ------------------------------------------------------------------- verify
say "Verification"
psql_ -tA -F' | ' -c "
select 'tables',      count(*)::text from information_schema.tables where table_schema='public' and table_type='BASE TABLE'
union all select 'functions',   count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
union all select 'triggers',    count(*)::text from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname in ('public','auth')
union all select 'policies',    count(*)::text from pg_policies where schemaname='public'
union all select 'rls_enabled', count(*)::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity
union all select 'foreign_keys',count(*)::text from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and con.contype='f'
union all select 'auth.users',  count(*)::text from auth.users
union all select 'auth.identities', count(*)::text from auth.identities
union all select 'orders',      count(*)::text from public.orders
union all select 'shipments',   count(*)::text from public.shipments
union all select 'profiles',    count(*)::text from public.profiles
union all select 'wallets',     count(*)::text from public.wallets
union all select 'orphan_orders', count(*)::text from public.orders o where not exists (select 1 from auth.users u where u.id=o.user_id)
union all select 'dup_profiles', (select count(*) from (select user_id from public.profiles group by user_id having count(*)>1) d)::text
union all select 'dup_wallets',  (select count(*) from (select user_id from public.wallets group by user_id having count(*)>1) d)::text
union all select 'bcrypt_hashes', count(*)::text || '/' || (select count(*) from auth.users)::text from auth.users where encrypted_password like '\$2a\$%';"

cat <<'EOF'

Expected: 18 tables · 12 functions · 13 triggers · 64 policies · RLS 18 ·
12 foreign keys · 724 users · 724 identities · 909 orders · 1579 shipments ·
724 profiles · 724 wallets · 0 orphans · 0 duplicates · 724/724 bcrypt.

Anything else, stop and read restore.md before going further.

Still to do after this:
  04_cron.sql   the 8 scheduled jobs (the dump's cron.job rows carry the OLD
                project URL and anon JWT, so they are deliberately not restored)
  edge functions + secrets
  backups
EOF

docker exec "$CONTAINER" rm -f /tmp/restore.backup
echo
echo "Dump removed from the container. Delete it from the host too when done:"
echo "  shred -u $DUMP   # it holds every user's password hash"
