# Restoring the Lovable dump into the self-hosted stack

Lovable's **Cloud → Advanced settings → Export project data** produces a real
`pg_dump` custom-format archive. That supersedes the REST-transfer path: exact
fidelity, `auth.users` included natively, no bridge RPCs, no trigger juggling.

This procedure was rehearsed end to end on 2026-09-17 against
`supabase/postgres:17.6.1.169` + `supabase/gotrue:v2.186.0` in local Docker,
using the real 87 MB production dump. Everything below is what actually worked,
including the parts that failed first.

## The archive

```
humayra26_260917.backup   86,933,520 bytes
Format: CUSTOM · Compression: zstd · Dump version 1.16-0
Dumped from database version: 17.6 · Dumped by pg_dump version: 18.6
Archive created at 2026-09-17 11:12:24 UTC · 871 TOC entries
```

**It contains the whole `postgres` database** — `auth`, `storage`, `realtime`,
`vault`, `cron`, `graphql`, `supabase_migrations` and `public`. Its `public`
schema independently confirms the introspected `01_schema.sql`: 18 tables,
12 functions, 64 policies, 11 public triggers, 13 indexes, 12 FKs, 1 enum,
RLS on all 18.

> This file holds every user's bcrypt hash, emails, phone numbers, addresses,
> 906+ orders with payment references, and `vault.secrets`. It is gitignored.
> Delete it once the migration is done.

## Why the target must be PostgreSQL 17

The dump is from PG 17.6. A PG17 dump does not restore into PG15, so the
Coolify template's `supabase/postgres:15.8.1.085` is not an option once you
are restoring rather than replaying DDL. See the version-parity note in
[README.md](README.md).

## Just run the script

[restore.sh](restore.sh) does everything below. It was executed against the real
dump on a local rig running the exact VPS versions (`supabase/postgres:17.6.1.173`
+ `supabase/gotrue:v2.186.0`): all five passes completed with zero errors and hit
every expected count. Re-running it refuses unless given `--force`, and `--force`
reproduces identical results.

```sh
scp "humayra26_260917.backup" root@<vps>:/root/
scp supabase/selfhost/restore.sh root@<vps>:/root/
ssh root@<vps> 'chmod +x restore.sh && ./restore.sh \
  /root/humayra26_260917.backup supabase-db-emhbzh3hwap5rmq6ysysloil'
```

It refuses to run if the target is not PostgreSQL 17, if GoTrue has not yet
migrated the auth schema, or if `public` already contains tables. The rest of
this document explains why it is shaped the way it is.

## The five passes

Restore order is dictated by dependencies, and `pg_restore` does **not** order
data entries to satisfy them. Each pass below exists because skipping it failed.

| # | Contents | Why separately |
|---|---|---|
| 1 | `auth.users` data | 9 of 12 public FKs and every other auth table point at it |
| 2 | remaining `auth` data | `identities`, `sessions`, … all FK to `auth.users` |
| 3 | `auth.refresh_tokens`, `auth.mfa_amr_claims` | these FK to `auth.sessions`, loaded in pass 2 |
| 4 | `public` schema + data | FKs to `auth.users` now resolve |
| 5 | the 2 `auth.users` triggers | they call `public.handle_new_user` / `handle_new_wallet`, which only exist after pass 4 |

Pass 5 must come **last** for a second reason: those are `AFTER INSERT` row
triggers, and `COPY` fires row triggers. Create them before the auth load and
you get 724 duplicate profiles and 724 duplicate wallets — the same trap the
REST path needed `set_import_mode` to avoid. Restoring from a dump avoids it
naturally, as long as the order holds.

## Prerequisite: GoTrue must migrate the auth schema first

`supabase/postgres` ships only a **stub** `auth` schema — 5 tables, and
`auth.users` with 21 columns from GoTrue's original 2017 layout. It has no
`email_confirmed_at`, so the restore fails outright. The real schema is created
by GoTrue at boot.

So: bring the whole stack up, let `supabase-auth` run its migrations
(v2.186.0 applies 67, producing 20 auth tables), and only then restore.

## What is deliberately excluded

| Excluded | Reason |
|---|---|
| `public.search_cache` data | 43,190 rows / 210 MB of the 258 MB database; rebuilds itself from TMAPI |
| `storage.objects` data | 16,278 rows of metadata for files that are all leaked scratch uploads; restoring it would create references to objects MinIO does not have |
| `auth.schema_migrations` | the target's GoTrue owns its own migration state; overwriting it makes GoTrue think it is a different version |
| `auth.audit_log_entries` | bulky, no operational value after a migration |
| `auth.one_time_tokens` | column set differs (see below), and the rows are short-lived confirmation/recovery tokens |
| `cron.job` data | comes across with the old project URL and anon JWT baked in; use `04_cron.sql` instead |
| `vault.secrets` data | encrypted with the source project's vault key, which we do not have — it cannot be decrypted on the new stack |

## Lovable runs a newer GoTrue than your stack

The dump has **27** auth tables; GoTrue v2.186.0 creates **20**. Absent in the
target: `custom_oauth_providers`, `mfa_recovery_code_sets`,
`mfa_recovery_codes`, `scim_tokens`, `scim_users`, `webauthn_challenges`,
`webauthn_credentials`. `auth.one_time_tokens` also gained an `expires_at`
column upstream.

All seven are empty in production — 0 MFA factors, 0 SSO users, no SCIM, no
WebAuthn — so skipping them loses nothing today. But it means the self-hosted
stack is running *behind* production's auth. Worth bumping `supabase-auth` to a
newer tag before cutover so the schemas converge.

## Rehearsal results

Restored into `supabase/postgres:17.6.1.169`, pass 4 completed with **zero
errors** and all 12 foreign keys created.

| Check | Result |
|---|---|
| tables / functions / policies / RLS | 18 / 12 / 64 / 18 ✓ |
| triggers | 13 ✓ (11 public + 2 on `auth.users`) |
| foreign keys | 12 ✓ |
| `auth.users` / `auth.identities` | 724 / 724 ✓ |
| `auth.sessions` / `auth.refresh_tokens` | 1,410 / 9,357 ✓ |
| orphaned orders | 0 ✓ |
| duplicate profiles / wallets | 0 / 0 ✓ |
| password hashes | 724/724 `$2a$10$` ✓ |
| `anon` / `authenticated` grants | all 18 tables ✓ |
| `anon` read through RLS | 420 rows from `category_products` ✓ |
| **password grant via GoTrue** | **HTTP 200, access token issued** ✓ |

Row counts after restore, which are what [verify.sql](verify.sql) now checks
against: 909 orders · 1,579 shipments · 1,919 cart_items · 3,336 notifications ·
3,970 sms_logs · 816 wishlist · 724 profiles · 724 wallets · 420
category_products · 330 transactions · 1,077 phone_otps · 52 role_permissions ·
31 app_settings · 21 admin_messages · 15 trending_products · 3 user_roles ·
0 refunds.

These differ slightly from the counts taken by querying production directly
(906 orders, 1,576 shipments, …) because production kept taking orders between
the two measurements. **The dump is the source of truth**, not a separate query.

## Caveat on the login test

No real user's plaintext password is available, so the test replaced one
migrated user's hash with a freshly generated bcrypt and authenticated with
that. It proves GoTrue verifies an externally written `$2a$` hash, which is the
portability question — but confirm one genuine account with its real password
before the actual cutover. Every hash in production is `$2a$10$`, standard
bcrypt, so the residual risk is small.

## Still required after the restore

The dump does not carry these, or carries them unusable:

1. **`04_cron.sql`** — the 8 scheduled jobs, rewritten for the new URL and key.
2. **Edge functions** — 17 of them, all confirmed deployed on production
   described in [README.md](README.md).
3. **Secrets** — the edge-function env vars.
4. **Storage buckets** — `02_functions_rls.sql` creates both, empty.
5. **Backups** — nothing takes them on a self-hosted stack until you set it up.
