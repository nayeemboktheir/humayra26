# Self-hosted Supabase — rehearsal runbook

Moving TradeOn's backend off Lovable Cloud onto the self-hosted Supabase stack
already running in Coolify. **This round is a rehearsal**, not the cutover:
load a snapshot of production into the new stack, point a staging build at it,
and find out what breaks while `tradeon.global` carries on untouched.

[LOVABLE-MIGRATION-PLAN.md](../../LOVABLE-MIGRATION-PLAN.md) is the older plan
and still describes the overall shape, but it targets a *Supabase Cloud* project
and its inventory is six months stale. Where the two disagree, this file wins.

---

## The target stack

Already provisioned, healthy since 2026-09-07. Coolify project `Tradeon`,
service `supabase` (`wokkyc531r9nh5mg1bs2ooyg`), running on the Coolify host.

| Component | Version |
|---|---|
| Postgres | `supabase/postgres:15.8.1.085` |
| Auth | `gotrue:v2.186.0` |
| REST | `postgrest:v14.6` |
| Storage | `storage-api:v1.44.2` on **MinIO** (S3 backend) |
| Edge runtime | `edge-runtime:v1.71.2` |
| Realtime | `realtime:v2.76.5` |
| Gateway | `kong:3.9.1` |

Currently answering on `https://supabasekong-wokkyc531r9nh5mg1bs2ooyg.botbhai.net`.
The decision is to move it to **`api.tradeon.global`** before anything is baked
into a build — that hostname ends up in the frontend bundle, in PayStation
callbacks and in auth email links, and changing it later costs another cutover.

> The stack sits on the same host that runs Coolify itself. That is fine for a
> rehearsal. Before this carries real orders, it should move to the second server
> (`72.60.200.46`) or the control plane and the production database share a
> blast radius.

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

**Load order is not negotiable.** Nine of the twelve foreign keys point at
`auth.users`, so auth loads first. And three triggers have to be off during the
load — `on_auth_user_created`, `on_auth_user_created_wallet` and
`trigger_auto_create_shipment` — or you end up with 724 duplicate profiles, 724
duplicate wallets and 906 phantom shipments. That is what `set_import_mode`
exists for; `verify.sql` fails if it was missed.

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
- **Edge functions.** 15 of them, and self-hosting changes the deal: there is no
  `supabase functions deploy`, functions are files bind-mounted into the
  edge-runtime container, and **`config.toml`'s per-function `verify_jwt` is
  ignored** — the self-hosted runtime has one global `FUNCTIONS_VERIFY_JWT`.
  14 functions want `verify_jwt = false` and `admin-send-sms` wants `true`, so
  the global goes to `false` and `admin-send-sms` has to check the JWT in its own
  code. That is a real code change and it is not written yet.
- **Secrets.** `TMAPI_TOKEN`, `OTCOMMERCE_API_KEY`, `FIRECRAWL_API_KEY`,
  `PAYSTATION_MERCHANT_ID`, `PAYSTATION_PASSWORD`, `RESEND_API_KEY`,
  `SEND_EMAIL_HOOK_SECRET`. `LOVABLE_API_KEY` is only a shared bearer secret in
  `auth-email-hook` — rename it `AUTH_HOOK_SECRET` and generate a fresh value.
  Reuse the existing `TMAPI_TOKEN`; it is billed per token.
- **Backups.** Lovable took care of this invisibly. Self-hosted, nothing does
  until we set up `pg_dump` on a schedule with an offsite copy. This should not
  be left until cutover day.
- **PayStation callbacks** point at the old project's edge functions. They break
  silently — orders stop reconciling with no error anywhere. Not a rehearsal
  problem, but it is the thing most likely to be forgotten on cutover day.
