# Self-hosted Supabase — rehearsal runbook

Moving TradeOn's backend off Lovable Cloud onto the self-hosted Supabase stack
already running in Coolify. **This round is a rehearsal**, not the cutover:
load a snapshot of production into the new stack, point a staging build at it,
and find out what breaks while `tradeon.global` carries on untouched.

[LOVABLE-MIGRATION-PLAN.md](../../LOVABLE-MIGRATION-PLAN.md) is the older plan
and still describes the overall shape, but it targets a *Supabase Cloud* project
and its inventory is six months stale. Where the two disagree, this file wins.

---

## Status — 2026-09-17

**The rehearsal database is loaded and verified.** What is done:

- Stack rebuilt on `supabase/postgres:17.6.1.173`, answering on
  **`https://api.tradeon.global`**.
- Production dump restored via [restore.sh](restore.sh). All 16 parity checks
  matched: 18 tables · 12 functions · 13 triggers · 64 policies · RLS 18 ·
  12 FKs · 724 users · 724 identities · 909 orders · 1,579 shipments ·
  0 orphans · 0 duplicates · 724/724 bcrypt.
- Confirmed through Kong/PostgREST, not just psql: `service_role` sees correct
  counts, `anon` reads `category_products` but gets `[]` for `orders`, and
  `get_my_role` / `get_category_products` / `get_shipment_stage_counts` all respond.
- The 8 cron jobs are scheduled and active via [04_cron.sql](04_cron.sql).

Outstanding: edge functions + their secrets, backups, and rotating the stack
credentials (the dashboard Basic-auth pair guarding the publicly reachable
Studio at `/` is the urgent one).

**Where the truth lives:** [restore.md](restore.md) is the procedure that was
actually used. The sections below are the earlier REST-transfer design, kept
because the schema analysis in them still holds — but the order-of-operations
table is superseded.

---

## The target stack

Coolify project `Tradeon`, service `supabase` (`emhbzh3hwap5rmq6ysysloil`),
running on the Coolify host. The original service (`wokkyc531r9nh5mg1bs2ooyg`)
was deleted and recreated to get onto Postgres 17 — swapping the image tag alone
failed, because the template's `postgresql.conf` was written for 15.

| Component | Version |
|---|---|
| Postgres | `supabase/postgres:17.6.1.173` (template default was `15.8.1.085` — see below) |
| Auth | `gotrue:v2.186.0` |
| REST | `postgrest:v14.6` |
| Storage | `storage-api:v1.44.2` on **MinIO** (S3 backend) |
| Edge runtime | `edge-runtime:v1.71.2` |
| Realtime | `realtime:v2.76.5` |
| Gateway | `kong:3.9.1` |

Answering on **`https://api.tradeon.global`**, which is Cloudflare-proxied. That
matters for two things later: Cloudflare caps request bodies at 100 MB (storage
uploads) and terminates WebSockets, so test Realtime before relying on it.

Note that `/` on that hostname serves **Studio behind HTTP Basic auth**, and
`/pg/` serves postgres-meta. Both are publicly reachable, so the
`DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` pair is effectively an internet-facing
credential guarding full SQL access. Treat it accordingly.

> The stack sits on the same host that runs Coolify itself. That is fine for a
> rehearsal. Before this carries real orders, it should move to the second server
> (`72.60.200.46`) or the control plane and the production database share a
> blast radius.

### Postgres version parity

Lovable Cloud runs **PostgreSQL 17.6.1.063**. Coolify's Supabase template ships
`supabase/postgres:15.8.1.085`, so the stack as provisioned would be a major
version *downgrade*, 17 → 15.

Strictly, the transfer does not require matching versions — it is logical (DDL
text plus JSON rows), and the schema uses nothing newer than PG12: plain tables,
btree indexes, `sql`/`plpgsql` functions, RLS, one enum. It would load into 15.

Match anyway, and do it before the first load:

- A downgrade is a one-way ratchet. It works today only because the schema is
  simple; the first PG16/17 feature used on production can never come across.
- Planner behaviour differs between 15 and 17. This branch exists for
  performance work — benchmarking `hot_path_indexes` on 15 tells you nothing
  about a PG17 production.
- If Lovable's "Export project data" turns out to be a real `pg_dump`, a PG17
  dump **cannot** be restored into PG15 at all.

Change the `supabase-db` image tag in Coolify to **`supabase/postgres:17.6.1.173`**
and redeploy. That is the same PostgreSQL (17.6.1) as production with a newer
Supabase build number. Do not use the `-orioledb` or `-multigres` variants.
The stack is empty, so this costs one redeploy and risks nothing — after it
holds 17,340 rows it becomes a migration in its own right.

## Production snapshot — 2026-09-17

Source: Lovable project `9b21e26c-c5cd-41b4-817c-dd568d40eb7f`,
Supabase ref `kcihftfgmsrpcljsbjdj`. Read through the Lovable MCP connector's
`query_database`, which is still the only channel into that database.

**Schema:** 18 tables · 12 functions · 13 triggers · 64 policies · RLS on all 18
tables · 13 non-constraint indexes · 8 cron jobs · 2 storage buckets ·
extensions `pg_cron`, `pg_net`, `pgcrypto`, `uuid-ossp`, `supabase_vault`,
`pg_stat_statements`.

**Auth:** 724 users, every one a `$2a$` bcrypt hash, single `email` provider,
724 identities, 0 MFA factors, 0 SSO users. Nothing here blocks a hash copy.

**Rows:**

| Table | Rows | | Table | Rows |
|---|---:|---|---|---:|
| `auth.users` | 724 | | `orders` | 906 |
| `auth.identities` | 724 | | `phone_otps` | 1,077 |
| `admin_messages` | 21 | | `profiles` | 724 |
| `app_settings` | 31 | | `refunds` | 0 |
| `cart_items` | 1,921 | | `role_permissions` | 52 |
| `category_products` | 420 | | `shipments` | 1,576 |
| `notifications` | 3,312 | | `sms_logs` | 3,964 |
| `transactions` | 330 | | `trending_products` | 15 |
| `user_roles` | 3 | | `wallets` | 724 |
| `wishlist` | 816 | | `search_cache` | 43,190 *(skipped)* |

17,340 rows to move. The database reports 258 MB, but `search_cache` is 210 MB
of that and rebuilds itself from TMAPI, so the actual payload is under 10 MB.

## Three findings that change the old plan

**1. Storage is a no-op.** `temp-images` holds 16,273 objects / 627 MB, which
the old plan called the longest and most failure-prone step. Every one of those
files is garbage: [`alibaba-1688-image-search`](../functions/alibaba-1688-image-search/index.ts#L296)
schedules each upload's deletion with a `setTimeout` that never survives the
request, so nothing is ever cleaned up. No row in `orders`, `cart_items` or
`wishlist` references a storage URL at all. We create both buckets empty and
move zero bytes. *(The leak itself is still a live bug and should be fixed with
a cron sweep — separate piece of work, not part of the migration.)*

**2. The migration files cannot be replayed.** `supabase_migrations` records 33
versions against 43 files on disk. `get_my_role`, `get_category_products` and
`get_shipment_stage_counts` were applied by hand and never recorded;
`product_detail_cache` and `rate_limits` were never applied at all, and neither
were the `hot_path_indexes` — production has 13 indexes, none of them the ones
that migration adds. `supabase db push` would produce a database that matches
neither production nor the repo. So `01_schema.sql` and `02_functions_rls.sql`
are introspected from the live database instead. They are what production *is*.

**3. The pending migrations are deliberately left out.** Load a faithful copy
first, verify parity, *then* apply `hot_path_indexes`, `product_detail_cache`
and `rate_limits` on top. That is the only way to measure what they actually
buy — which is the point of the optimization work this branch exists for.

## Order of operations

Steps 1–3 and 5–6 are SQL files. Run them in the Coolify **Studio SQL editor**
(or `psql` if the Postgres port is reachable). Step 4 is driven from the Lovable
side.

| # | File | What it does |
|---|---|---|
| 1 | `01_schema.sql` | extensions, `app_role`, 18 tables, keys, FKs, 13 indexes |
| 2 | `02_functions_rls.sql` | 12 functions, 13 triggers, RLS, 64 policies, 2 buckets |
| 3 | `03_auth_import.sql` | temporary `import_auth_*` + `set_import_mode` RPCs |
| 4 | *(transfer)* | `set_import_mode(true)` → auth → public tables → `set_import_mode(false)` |
| 5 | `verify.sql` | object parity, row parity, hashes, orphans, duplicates |
| 6 | `99_cleanup.sql` | drops the temporary RPCs, re-enables triggers |
| 7 | `04_cron.sql` | the 8 scheduled jobs, rewritten for the new URL |

### Validation status

Steps 1–3 were applied to a throwaway `postgres:17-alpine` (PostgreSQL 17.11) on
2026-09-17 with `ON_ERROR_STOP=1`. All applied cleanly and produced exactly
production's object counts: **18 tables · 12 functions · 13 triggers · 64
policies · RLS on 18 · 13 indexes · 12 foreign keys · 2 buckets**.

The auth bridge was smoke-tested against synthetic rows and behaves correctly:
with import mode on, no phantom profiles/wallets/shipments are created and the
`$2a$` hash and empty-string token columns survive verbatim; with import mode
off, a signup creates its profile and wallet and a new order auto-creates its
shipment. The `CREATE EXTENSION` lines are the only part not covered — a vanilla
Postgres image has no `pg_net` or `pg_cron`.

**Load order is not negotiable.** Nine of the twelve foreign keys point at
`auth.users`, so auth loads first. And three triggers have to be off during the
load — `on_auth_user_created`, `on_auth_user_created_wallet` and
`trigger_auto_create_shipment` — or you end up with 724 duplicate profiles, 724
duplicate wallets and 906 phantom shipments. That is what `set_import_mode`
exists for; `verify.sql` fails if it was missed.

> **Superseded as of 2026-09-17.** Lovable's *Export project data* turns out to
> produce a real `pg_dump` custom-format archive, so the data now comes from
> that instead of the REST transfer described below. See
> [restore.md](restore.md) for the procedure that was actually rehearsed.
> Steps 3 and 4 in the table above are no longer needed — the dump carries
> `auth.users` natively, so the bridge RPCs and `set_import_mode` are unused.
> `01`/`02` remain as documentation of production's schema and as a fallback;
> `verify.sql`, `04_cron.sql` and `99_cleanup.sql` still apply.

### How the data actually moves

Production has no `pg_dump`, no connection string and no service-role key —
only arbitrary SQL over MCP. So the transfer runs **server to server**: batched
`net.http_post` calls from the Lovable database straight into the new stack's
PostgREST endpoint, authenticated with the new service-role key. `pg_net` is
already installed there (it is what the cron jobs use). Nothing is downloaded,
and no customer data passes through a chat transcript.

`auth.users` and `auth.identities` can't go over PostgREST — it only exposes
`public` — which is why step 3 installs two `SECURITY DEFINER` bridge functions,
granted to `service_role` alone and dropped again in step 6.

Fallback, if `pg_net` egress is blocked: page the tables out as JSON and load
them with `psql`. Slower and it puts customer data on disk, so it is the second
choice, not the first.

## Still open

- **Credentials.** Nothing past step 3 can run without the new stack's
  `SERVICE_ROLE_KEY` and `ANON_KEY`. Coolify's API deliberately never returns
  env values, so these have to be copied out of the Coolify UI by hand
  (service `supabase` → Environment Variables) into the gitignored `.env`:

  ```sh
  SELFHOST_SUPABASE_URL=https://api.tradeon.global   # or the current kong hostname
  SELFHOST_SERVICE_ROLE_KEY=...                      # Coolify: SERVICE_SUPABASESERVICE_KEY
  SELFHOST_ANON_KEY=...                              # Coolify: SERVICE_SUPABASEANON_KEY
  ```

  The service-role key bypasses RLS on every table. It belongs in `.env` and in
  Coolify, and nowhere else — not in a commit, not in a build arg, not in the
  frontend bundle.
- **`api.tradeon.global`** needs a DNS A record to the Coolify host and the FQDN
  set on the `supabase-kong` container.
- **Edge functions.** 17 of them (was 21; Firecrawl x3, the OTAPI `alibaba-1688-search` and `translate-text` removed as dead code). Self-hosting changes the deal: there is no
  `supabase functions deploy`, functions are files bind-mounted into the
  edge-runtime container, and **`config.toml`'s per-function `verify_jwt` is
  ignored** — the self-hosted runtime has one global `FUNCTIONS_VERIFY_JWT`,
  already set to `false`. That turns out to be fine: `admin-send-sms` was the
  only function wanting `verify_jwt = true`, and it already verifies the bearer
  token itself and checks `has_role(..., 'admin')`, returning 401/403 on its own.
  No code change needed.
- **Secrets.** `TMAPI_TOKEN`, `PAYSTATION_MERCHANT_ID`, `PAYSTATION_PASSWORD`,
  `RESEND_API_KEY`, `SEND_EMAIL_HOOK_SECRET`. Reuse the existing `TMAPI_TOKEN`;
  it is billed per token. `OTCOMMERCE_API_KEY`, `FIRECRAWL_API_KEY` and
  `LOVABLE_API_KEY` are all gone with the dead functions below.
- **GoTrue rejects a plain-HTTP hook URI.** `GOTRUE_HOOK_SEND_EMAIL_URI` must be
  `https://…` unless the host is localhost/127.0.0.1/::1 — an internal Docker
  service name over http fails config load with
  `only localhost, 127.0.0.1, and ::1 are supported with http`, and GoTrue
  crash-loops rather than starting degraded. Use the public URL:
  `https://api.tradeon.global/functions/v1/auth-email-hook`. The webhook then
  leaves the host and returns through Cloudflare and Kong, which costs tens of
  milliseconds on an operation that sends an email anyway.
- **The hook secret must be `v1,whsec_<base64>`**, the same value in both
  `GOTRUE_HOOK_SEND_EMAIL_SECRETS` (GoTrue signs) and `SEND_EMAIL_HOOK_SECRET`
  (the function verifies). Generate with `openssl rand -base64 32`; a bare or
  short value fails signature verification at runtime rather than at boot.
- **`Noop mail client being used` in the GoTrue log is expected** with the hook
  enabled and no SMTP — but it is also what silently swallows every email if the
  hook is *not* firing. Confirm with a real signup and the edge-function log, not
  by reading that line.
- **Auth email is currently dead on the new stack.** `mailer_autoconfirm` is
  `false`, so signup needs a confirmation mail, but there is no SMTP configured
  and no `GOTRUE_HOOK_SEND_EMAIL_*` set. Migrated users are unaffected (716 of
  724 were already confirmed); new signups and password resets are not. Needs
  `auth-email-hook` deployed, `RESEND_API_KEY` set, a `v1,whsec_<base64>` secret,
  and GoTrue pointed at `http://supabase-edge-functions:9000/functions/v1/auth-email-hook`.
  Drop the `LOVABLE_API_KEY` fallback in `isAuthorizedWebhook` rather than
  renaming it — a second accepted credential on an endpoint that sends mail from
  our domain is the weaker option once the signed path works.
- **`GOTRUE_SITE_URL` is wrong.** It is set to `https://api.tradeon.global`, the
  API hostname. GoTrue builds confirmation and reset links from it, so those
  emails would send users to the API instead of the storefront. Set it to the
  site URL, and fill `ADDITIONAL_REDIRECT_URLS`, which is empty.
- **Backups.** Lovable took care of this invisibly. Self-hosted, nothing does
  until we set up `pg_dump` on a schedule with an offsite copy. This should not
  be left until cutover day.
- **PayStation callbacks** point at the old project's edge functions. They break
  silently — orders stop reconciling with no error anywhere. Not a rehearsal
  problem, but it is the thing most likely to be forgotten on cutover day.
