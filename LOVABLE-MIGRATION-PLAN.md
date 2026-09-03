# Migrate TradeOn off Lovable Cloud to a self-owned Supabase

## Context

`tradeon.global` is a live store (771 orders, 597 users) whose backend is a **Lovable Cloud**
managed Supabase project (`kcihftfgmsrpcljsbjdj`). Lovable Cloud deliberately withholds
dashboard access, external connection strings, and the service-role key, and offers
**no automated transfer** — so today Lovable is the only thing that can deploy migrations
or edge functions. That is why 3 of the 6 performance migrations written in the previous
session are still unapplied in production.

Goal: own the backend outright — our own Supabase project, our own deploy pipeline, and
no Lovable dependency in the repo.

**The one viable export channel** is the Lovable MCP connector's `query_database`, which
executes arbitrary SQL (DDL + DML) against the managed Postgres. Everything below depends
on it. Both storage buckets are public, so their files are fetchable over plain HTTPS.

### Verified production inventory

| Item | Value |
|---|---|
| Auth users | 597 — **all `email` provider, all `$2a$` bcrypt** (portable) |
| Core data | 771 orders · 1,100 shipments · 597 profiles/wallets · 226 transactions · 420 category_products |
| `search_cache` | 26,177 rows — **do not migrate**, it self-rebuilds |
| Storage | 12,474 objects / 421 MB in `temp-images` + `image-search` (both public) |
| Database | 159 MB · 18 tables · 11 functions · 11 triggers · 66 RLS policies |
| Extensions | `pg_cron`, `pg_net`, `pgcrypto`, `uuid-ossp`, `supabase_vault`, `pg_stat_statements` |
| Cron jobs | **8**, all `22:0x` daily — **not in any migration file** |
| Edge functions | 15 |
| Secrets | 10 |

### Decisions taken
- Preserve user passwords (copy bcrypt hashes) — no mass reset.
- Short maintenance window (~1–2h, overnight) rather than zero-downtime dual-write.
- Stabilise the current system first, then migrate a known-good one.

---

## Phase 0 — Stabilise before migrating

Do not migrate a system with known bugs and a half-applied schema.

1. Fix the 6 review findings in our own code:
   - `src/components/ProductDetail.tsx` — restore short-circuit on the province probe
     (currently `Promise.all` fires all 3 paid TMAPI calls every time).
   - `src/pages/Index.tsx` — surface/handle RPC errors instead of discarding them.
   - `src/lib/roles.ts` — add a TTL to the session role cache.
   - `src/components/admin/AdminDataTable.tsx` — clamp page offset after mutations; collapse
     the duplicate query on search/filter change.
   - `src/lib/cdnImage.ts` — fix the `data-tried-original` reuse bug and the placeholder guard.
2. Apply the 3 unapplied migrations to the **current** database via `query_database`:
   `20260824120000_product_detail_cache`, `20260824120200_hot_path_indexes`,
   `20260824120400_rls_initplan_auth_uid`.
3. Confirm the app is healthy on the existing backend. This is the rollback target.

---

## Phase 1 — Provision our own project

- Create a Supabase project in the existing **Platiroll** org (`acnxxdxuctlflmtaattc`),
  region **ap-south-1 (Mumbai)** — closest to the Bangladeshi user base.
- Install the Supabase CLI; `supabase link` to the new ref.
- Enable the 6 extensions listed above.
- Apply the full migration history from `supabase/migrations/` (30 files) with `supabase db push`.
  - Two pre-existing migrations reference `storage.buckets` and `cron`; they will now succeed
    because we control the project.
- Diff the resulting schema against production (table/function/policy/index counts) before
  loading any data.

## Phase 2 — Export from Lovable Cloud

All reads go through `mcp__claude_ai_Lovable__query_database` (project
`9b21e26c-c5cd-41b4-817c-dd568d40eb7f`), chunked to stay under response limits.

- **Auth**: `auth.users` (include `encrypted_password`, `email_confirmed_at`, `created_at`,
  `raw_user_meta_data`) and `auth.identities`. Treat as secret material — write to the
  scratchpad, never to the repo.
- **Public tables**: export as JSON ordered by primary key, in pages. Skip `search_cache`.
- **Storage**: export `storage.objects` metadata, then download each file from
  `https://kcihftfgmsrpcljsbjdj.supabase.co/storage/v1/object/public/<bucket>/<name>`.
  12,474 files — needs a resumable script with a manifest and checksum, not a one-shot loop.

## Phase 3 — Import

- Load `auth.users` then `auth.identities` **before** public tables, so the many
  `user_id → auth.users` foreign keys resolve.
- Disable the `handle_new_user` / `handle_new_wallet` triggers during the auth load, or they
  will double-create profiles and wallets that we are also importing. Re-enable afterwards.
- Load public tables in FK order; reset any sequences afterwards.
- Re-upload storage files to matching buckets via the CLI/storage API, preserving paths so
  existing `image_url` values keep resolving.
- **Verify a real login against a test account before going further.** This is the single
  riskiest assumption in the plan; if bcrypt verification fails, fall back to bulk password
  reset rather than proceeding on hope.

## Phase 4 — Functions, secrets, cron

- `supabase functions deploy` all 15, honouring the `verify_jwt` flags already declared in
  `supabase/config.toml`.
- Set the 10 secrets: `TMAPI_TOKEN`, `OTCOMMERCE_API_KEY`, `FIRECRAWL_API_KEY`,
  `PAYSTATION_MERCHANT_ID`, `PAYSTATION_PASSWORD`, `RESEND_API_KEY`, plus the Supabase-injected
  trio. `LOVABLE_API_KEY` is only a shared bearer secret in `auth-email-hook` — rename it to
  `AUTH_HOOK_SECRET` and generate a fresh value.
- **Recreate the 8 cron jobs**, rewriting the hardcoded project URL and bearer JWT in each
  `net.http_post` command. Capture them as a new migration so they are version-controlled
  this time.
- Reconfigure the Auth email hook to point at the new `auth-email-hook` URL.

## Phase 5 — Cutover (maintenance window)

1. Announce/enable maintenance; stop writes.
2. Re-export the delta for mutable tables (`orders`, `shipments`, `transactions`,
   `notifications`, `admin_messages`, `cart_items`, `wishlist`) — everything changed since the
   bulk export.
3. Update `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PROJECT_ID`
   in `.env` **and** in GitHub Actions secrets.
4. **Update the PayStation webhook/callback URL** with the payment provider — it points at the
   old project's edge functions and will silently break payments otherwise.
5. Redeploy the frontend; smoke-test login, search, product detail, checkout, admin.
6. Keep the Lovable project untouched for a rollback window (reverting = restoring the old env
   vars and redeploying).

## Phase 6 — Self-deploy pipeline and Lovable removal

Extend `.github/workflows/deploy.yml` (currently frontend-only: build → Hostinger FTP) with
`supabase db push` and `supabase functions deploy` steps, gated on `SUPABASE_ACCESS_TOKEN` and
`SUPABASE_PROJECT_REF` secrets. This is what permanently replaces Lovable.

Then strip Lovable from the repo:
- `package.json` / `vite.config.ts` — remove `lovable-tagger`.
- `src/integrations/supabase/previewAuthStorage.ts` — delete; revert `client.ts` to plain
  `localStorage`.
- `supabase/functions/translate-text/` — delete (only caller of `ai.gateway.lovable.dev`, and
  nothing in the app invokes it; TMAPI already returns English titles).
- `capacitor.config.ts` — replace the `lovableproject.com` server URL and `app.lovable.*` appId.
- `README.md`, `.lovable/` — remove Lovable instructions.

---

## Verification

- **Schema parity**: compare table, function, trigger, index, and policy counts old vs new;
  expect 18 / 11+3 / 11 / all-indexes / 66.
- **Row parity**: per-table counts match the export manifest (excluding `search_cache`).
- **Auth**: log in as a real migrated account with its original password. Also confirm signup,
  password reset, and the SMS OTP flow.
- **Storage**: sample ~50 objects across both buckets; confirm HTTP 200, matching byte size,
  and that product images still render.
- **RLS**: repeat the isolation checks from the previous session — a user sees only their own
  orders, an admin sees all, anon sees none.
- **App**: `npm test`, `npx tsc --noEmit`, `npm run build`, then exercise homepage, search,
  product detail, checkout, and the admin tables against the new backend.
- **Cron**: manually trigger one refresh job and confirm `category_products` updates.
- **Pipeline**: push a trivial migration and confirm CI applies it without Lovable.

## Principal risks

1. **Password hashes** — verify on a test account before committing to the cutover; bulk reset
   is the fallback.
2. **12,474 storage files** — the longest-running, most failure-prone step; make it resumable
   and run it well before the window.
3. **Payment callbacks** — a missed PayStation URL update breaks orders silently after cutover.
4. **Cron jobs** — invisible in migrations; easy to forget, and their loss degrades the
   homepage quietly over days.
5. **Export channel** — everything depends on Lovable MCP `query_database` remaining
   available. Complete the export before changing anything in Lovable.
