# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

TradeOn Global (`tradeon.global`) — a live production storefront that resells 1688.com /
Alibaba wholesale products into Bangladesh. Vite + React 18 + TypeScript SPA, shadcn/ui +
Tailwind, Supabase for auth/data/edge functions, TMAPI (`api.tmapi.top/1688`) as the
upstream product source.

The site has real users, orders and payments and hits PayStation live.

**Production cutover completed 2026-09-21.** `tradeon.global` now runs on the self-hosted
stack — same Coolify app, same self-hosted Supabase project, as what this file used to call
"staging." The Lovable-managed project is retired: no longer written to, DNS no longer
points at it, kept running only as a rollback fallback. `DEPLOY-STAGING.md`,
`LOVABLE-MIGRATION-PLAN.md` and `SELFHOST-MIGRATION-REPORT.md` describe the state and plan
*before* this — read `supabase/selfhost/CUTOVER-RUNBOOK.md` for what actually happened,
including two bugs the rehearsal didn't catch that would otherwise have re-broken
production at cutover.

## Commands

```sh
bun install        # bun.lock is the canonical lockfile (package-lock.json has drifted; npm ci fails)
bun run dev        # Vite dev server on :8080
bun run build      # production build -> dist/
bun run build:dev  # development-mode build
bun run lint       # eslint
bun run test       # vitest run (jsdom)
bun run test:watch
```

Single test file / single case:

```sh
bunx vitest run src/test/cdnImage.test.ts
bunx vitest run -t "returns the original url"
```

Tests live in `src/test/`, config in [vitest.config.ts](vitest.config.ts) (separate from
`vite.config.ts` — imagetools and lovable-tagger are not loaded under test), setup in
[src/test/setup.ts](src/test/setup.ts).

TypeScript is deliberately loose (`strict: false`, `noImplicitAny: false`,
`strictNullChecks: false`) and `@typescript-eslint/no-unused-vars` is off. There is no
typecheck script; `bun run build` is the type-adjacent gate.

## One deployment, one codebase (post-cutover)

| | `tradeon.global` + `trade.botbhai.net` |
|---|---|
| Branch | `optimization` |
| Path | Coolify `dockercompose` ([docker-compose.yml](docker-compose.yml), [Dockerfile](Dockerfile), [Caddyfile](Caddyfile)), auto-deploys on push |
| Host | Both domains registered on the same Coolify app (`tradeon`, uuid `tsdgr9lbnkhiupfuv97tmofp`), Traefik in front |
| Backend | Self-hosted Supabase at `api.tradeon.global` |

Both domains are Traefik routes on the **same running container** — there is only one
build to reason about now, not two. `trade.botbhai.net` was the staging domain during the
migration and still resolves; `tradeon.global` is what real customers use.

The edge functions cache in Postgres (`search_cache`, `product_cache`, 12h TTL — measured
3.03s cold vs 0.23s warm) plus the durable `products` catalogue described below.
Maintaining a second copy of the TMAPI mapping had already shipped one production bug
(`_shared/normalize-img.ts` exists because of it) — do not reintroduce that pattern.

`server.cjs` is a standalone Node static server + OG-tag injector for product links; it is
not part of the build pipeline above and its status post-cutover has not been re-verified.

`DEPLOY-STAGING.md` and `LOVABLE-MIGRATION-PLAN.md` describe the *pre-cutover* state (two
separate deployments, Lovable as production) and the plan to get from there to here — keep
them for history, but do not follow their setup instructions as current. The GitHub
Actions → Hostinger FTP pipeline (`.github/workflows/deploy.yml`) that used to deploy
production is no longer what serves live traffic; nobody has decided yet whether to keep
it as an emergency fallback or remove it.

## Deploying edge functions and SQL — this is production now

There is no CLI path and no CI for this — everything is applied by hand on the VPS. This
used to be the "staging" deploy process; since the cutover it is how you change production.
Treat every step here as live-traffic-affecting.

- **Edge functions**: `tar czf functions.tgz -C supabase functions`, `scp` it up, then
  `sudo ANON_KEY=<selfhost anon key> ./deploy-functions.sh ~/functions`
  ([supabase/selfhost/deploy-functions.sh](supabase/selfhost/deploy-functions.sh)). It
  copies into a bind mount and restarts the runtime — no build step. Check the
  `functions: N` count in its preflight; it deploys whatever is in the directory you point
  it at, so a stale tarball produces a clean-looking run that is missing your new function.
- **SQL**: `docker exec -i supabase-db-<uuid> psql -U postgres -d postgres < file.sql`.
  Cron jobs live in [supabase/selfhost/04_cron.sql](supabase/selfhost/04_cron.sql) and
  `05_cron_price_refresh.sql`, which take `base_url`/`anon_key` as psql variables so no key
  is committed.
- **SQL lives in three places, and only two of them are obvious.** Besides
  `supabase/selfhost/*.sql` (the numbered setup files) and `supabase/migrations/*.sql` (the
  Lovable history), there is now `drizzle/migrations/*.sql`, added by a merge from the
  Lovable-connected repo. `drizzle-kit` is only a devDependency and there is no `db:migrate`
  script, so **nothing applies those automatically** — they have to be run by hand like the
  others. This is not theoretical: `set_order_shipment_stage` shipped to the frontend
  (`ShipmentTimeline.tsx`, `AdminOrders.tsx`) while the function did not exist on the
  self-hosted database, so changing an order's shipment stage failed. When checking whether
  a database is up to date, check all three directories.
- **Storage buckets are not in any migration applied to this stack.** `temp-images` (public)
  must exist or uploaded-image search fails with `Bucket not found`;
  [supabase/selfhost/02_functions_rls.sql](supabase/selfhost/02_functions_rls.sql) creates
  it, but it has gone missing at least once.
- **A `--force` restore (`restore.sh`) drops `service_role`'s access to every table.**
  `drop schema public cascade; create schema public;` gives the schema a new identity,
  which silently orphans the `ALTER DEFAULT PRIVILEGES` wiring that let tables inherit
  `anon`/`authenticated`/`service_role` grants automatically — the reason neither
  `01_schema.sql` nor `02_functions_rls.sql` ever needed an explicit `GRANT`. `pg_restore`
  runs with `--no-privileges` on top of that (correctly — the dump's own grants target the
  source project's roles, which do not exist here). Net effect: every table returns `403
  permission denied` through PostgREST, for every role, and nothing about RLS or the
  restore's own verification block catches it, because that runs as the `postgres`
  superuser. Run [supabase/selfhost/06_regrant_after_restore.sql](supabase/selfhost/06_regrant_after_restore.sql)
  after **any** `--force` restore; its last query must return 0 rows.

**The runtime terminates isolates shortly after the response is sent** — the log says
`early termination has been triggered`. `EdgeRuntime.waitUntil` work only survives if it is
short: a single DB write is fine, a chain of upstream fetches is not. Anything that must
persist has to be written *first*, with enrichment layered on afterwards, and long-running
refresh work belongs in a cron rather than deferred on a request. This silently broke the
`product_cache` write once, making every product view look like a cache miss.

**A merged `bun.lock` is not trustworthy until proven otherwise.** A branch merge once
landed a `bun.lock` with a half-written dependency entry (`@img/sharp-wasm32` referencing
`@emnapi/runtime`, which the lockfile never actually recorded) — `git`-level merges on a
lockfile do not validate that the result resolves. `bun install --frozen-lockfile` (what the
Dockerfile runs) failed with `InvalidPackageInfo: failed to parse lockfile`, so **every
deploy failed at build time for four pushes in a row**, each looking like a normal failed
build in Coolify — nothing suggested the previous three commits' worth of work had never
gone live. After any merge that touches `bun.lock` or `package.json`, run
`bun install --frozen-lockfile` locally before trusting that a push will actually deploy.

## Backend: former Lovable-managed Supabase (retired 2026-09-21)

The Supabase project (`kcihftfgmsrpcljsbjdj`) was **Lovable Cloud managed** — no dashboard,
no service-role key, no direct connection string — and was production until the cutover.
It is kept running, untouched, as a rollback fallback only; nothing writes to it and DNS no
longer points at it. `LOVABLE-MIGRATION-PLAN.md` is the plan that got it here and
`supabase/selfhost/CUTOVER-RUNBOOK.md` is what actually happened. The points below are
historical — they explain *why* the self-hosted stack is shaped the way it is, not a
description of anything still live:

- `supabase/migrations/*.sql` and `supabase/functions/*` could not be deployed from this
  repo with the Supabase CLI while Lovable managed the project. The self-hosted stack has
  no such restriction — see "Deploying edge functions and SQL" above.
- TMAPI mapping lives in the edge functions only. It used to be duplicated in
  `cache-api/src/tmapiMap.js`, the copies drifted, and production search shipped broken
  thumbnails (AUDIT.md §8.1). `supabase/functions/_shared/normalize-img.ts` and
  `_shared/map-detail.ts` (the item_detail → ProductDetail1688 mapper, shared by
  `alibaba-1688-item-get` and `refresh-product-prices`) are the single implementations —
  do not re-create a second one of either.

Most `alibaba-1688-*`, `paystation-*` and SMS functions run with
`verify_jwt = false` ([supabase/config.toml](supabase/config.toml)); `admin-send-sms` is
the JWT-verified exception.

Key tables (see [src/integrations/supabase/types.ts](src/integrations/supabase/types.ts),
which is generated — do not hand-edit): `orders`, `shipments`, `profiles`, `wallets`,
`transactions`, `refunds`, `cart_items`, `wishlist`, `user_roles`, `role_permissions`,
`app_settings`, `search_cache`, `category_products`, `trending_products`. RPCs include
`get_my_role`, `get_category_products`, `has_role`, `get_shipment_stage_counts`.

## The product catalog (self-hosted stack only)

`products` ([supabase/migrations/20260918150000_products_catalog.sql](supabase/migrations/20260918150000_products_catalog.sql))
is a durable catalogue, as opposed to the two caches that preceded it: `search_cache` keys
whole result *pages* by query and `product_cache` expires after 12h, so neither accumulates.
Rows arrive in two tiers — listing fields for every search result (free, the response
already has them, ~482 B/row) and full `detail` when someone opens the product (~9.8 KB/row).
`_shared/catalog.ts` holds both writers.

Freshness is tracked per concern, not as one TTL, because a product's description, specs and
variant structure are static while its price is not. `alibaba-1688-item-get` serves from the
catalogue only when `price_checked_at` is within 7 days, and `refresh-product-prices`
(hourly cron) re-verifies stale prices off the request path. That refresh **must** carry
`desc`/`desc_img` and `seller_info.product_count` over from the stored row — they each cost a
separate upstream call, and re-deriving them from a bare `item_detail` silently downgrades an
enriched record.

Two conventions worth knowing before adding to either:

- **`search_cache` is used as a generic keyed store**, namespaced by key prefix: `img:`,
  `img2:` (image search), `ship:` (shipping quotes), `seller:` (seller products). Adding a
  cache does not require a new table.
- Catalogue upserts deliberately **omit** `detail`, `view_count` and `first_seen_at` so
  re-seeing a product in search cannot wipe its enrichment or reset its counters. A result
  page can also repeat an `item_id`, and Postgres rejects `ON CONFLICT DO UPDATE` touching a
  row twice in one statement, so batches are deduped first.

[supabase/selfhost/seed-catalog.mjs](supabase/selfhost/seed-catalog.mjs) fills the catalogue
without waiting for traffic. Use `--details --ranked`: seeding by `view_count` is useless on a
cold catalogue (every row is 0, so Postgres returns an arbitrary slice — measured 0% coverage
of the top 20 results for every category), whereas search-rank order reached 99%.

## Frontend architecture

**Routing and access control** — all routes are declared in
[src/App.tsx](src/App.tsx). Three wrappers gate them: `ProtectedRoute` (signed in),
`DashboardRoute` (signed in, non-staff — staff are redirected to `/admin`), `AdminRoute`
(staff only). Everything except `Index`, `Auth` and `NotFound` is `lazy()`-loaded; this is
load-bearing for bundle size, not incidental.

**Roles** — [src/lib/roles.ts](src/lib/roles.ts) is the single resolver
(`resolveUserRole` → `get_my_role` RPC) with a 5-minute TTL cache and in-flight
de-duplication keyed by user id. `useAdmin` and `useRolePermissions` both consume it and
mount together; don't add a second role query path. `role_permissions` rows drive
per-page access for non-admin staff.

**Currency** — [src/lib/currency.ts](src/lib/currency.ts) is a module-level store, not
React state. Rate and markup arrive asynchronously from `app_settings`, so `App` subscribes
via `useSyncExternalStore(subscribeCurrency, …)` to repaint prices once real values land.
Business rule: `getTierCnyPrice` always charges the **highest** per-unit tier (never a bulk
discount), and `convertToBDT` always rounds up.

**Settings** — [src/hooks/useAppSettings.ts](src/hooks/useAppSettings.ts) holds the full
default `app_settings` map (site copy, contact info, invoice fields, pixel IDs). Admins
edit these rows at `/admin/settings`; add new keys to the defaults object too.

**Components** — `src/components/ui/` is stock shadcn/ui (~49 files, regenerate rather than
restyle). Feature components sit one level up; `src/pages/Index.tsx` (~1700 lines) and
`src/components/ProductDetail.tsx` (~1200 lines) carry most of the storefront logic.

## Performance invariants

This branch exists for performance work; several things look odd on purpose and will
regress the site if "cleaned up":

- **Manual chunking** in [vite.config.ts](vite.config.ts): Hostinger rate-limits many
  parallel chunk requests, so output is collapsed into `vendor`, `vendor-charts`
  (recharts/d3) and `vendor-pdf` (jspdf/html2canvas). Vite's preload helper is pinned to
  `vendor` so lazy groups don't become static entry deps. Application code is left to
  Rollup's `lazy()` boundaries — do not add `src/` paths to `manualChunks`.
- **Asset naming** — `assets/tradeon-{app,chunk,asset}-[hash].*`. Both `public/.htaccess`
  and `Caddyfile` match those exact prefixes for `immutable` caching; renaming outputs
  silently breaks caching on both hosts.
- **No `Clear-Site-Data`** header, ever. It used to carry `storage`, which wiped the
  localStorage holding the Supabase session and signed users out on every SW update check.
- Entry documents (`index.html`, favicons, manifest) stay `no-cache`.
- CSS is made non-render-blocking by a custom `nonBlockingCss` Vite plugin
  (preload + `onload` swap, with a `<noscript>` fallback).
- **Images**: local assets are imported through vite-imagetools query params
  (`@/assets/logo-full.png?w=640&format=webp`); remote 1688 images go through
  [src/lib/cdnImage.ts](src/lib/cdnImage.ts), which appends alicdn size suffixes and pairs
  with `cdnImageFallback` for the one-shot retry to the original URL.
- **The product-detail hero paints from the clicked list item** before `item-get` returns.
  `ProductDetail` must keep testing `isLoading && !product` rather than `isLoading` alone,
  or that placeholder is discarded and the page blanks to a skeleton for the whole fetch.
  The placeholder hero also reuses the grid card's `srcSet`/`sizes` so the browser resolves
  to an image already in cache; requesting a single width instead re-downloads, because
  `sizes` is what decided which candidate the grid fetched.
  **Price is deliberately withheld** in that state: a list item carries no variant data and
  the page prices from `configuredItems[0]`, not the top-level price, so a product with
  variants would show e.g. ৳154 jumping to ৳188. Purchase controls stay disabled for the
  same reason — the real MOQ is not known yet.

## Things already investigated — do not re-litigate

- **Translation is TMAPI's, via `language=en`.** Verified directly: the same `item_detail`
  returns English with the parameter and Chinese without it, and it translates
  `product_props` too. There is no second translation layer; an older client-side one was
  removed. `translateLocation` in `ProductDetail` is not translation — it collapses any CJK
  origin to "China".
- **Image search cannot skip `tools/image/convert_url`.** That endpoint *ingests* the image
  into Alibaba's visual-search index and returns an internal token (`/search/imgextra5/…`):
  non-deterministic (same image → a different token each call), 404 on every alicdn host,
  and `global/search/image/v2` rejects a raw URL with `422 "please first use the convert
  endpoint"`. It costs 1.7–13.3s and that variance is upstream queueing, not payload size.
  Tokens stay valid for at least ~70 minutes, so caching `image hash → token` is the
  worthwhile optimisation, not shrinking the upload.
- **Do not shrink `compressImageForSearch` (640×640 q0.72) to chase speed.** Measured
  against 400×400 q0.5, three runs each: convert times overlapped completely, and only
  15–16 of the top 20 results still matched.
- Uploaded-image search needs `SUPABASE_PUBLIC_URL` set on the edge-functions service.
  `getPublicUrl()` builds from the internal gateway (`http://supabase-kong:8000`), which
  TMAPI cannot fetch, and the search then silently returns zero results.

## Styling

Tailwind with CSS-variable design tokens defined in [src/index.css](src/index.css) and
mapped in [tailwind.config.ts](tailwind.config.ts). Use semantic classes
(`bg-background`, `text-muted-foreground`, `border-border`) rather than raw color values;
dark mode is class-based.

## Environment

`.env` (gitignored) needs `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
`VITE_SUPABASE_PROJECT_ID`. `TMAPI_TOKEN` and the other upstream secrets belong on the
Supabase project (edge-function environment in Coolify), not in the frontend build.
`TMAPI_TOKEN` is billed per token — reuse the existing one, never provision a second.

`.env.selfhost` (gitignored) points a local build at the self-hosted stack:
`bun run dev:selfhost` / `bun run build:selfhost`. Since the cutover this is the *only*
backend there is — `.env`'s `VITE_SUPABASE_*` values and `.env.selfhost`'s should now
point at the same project; there is no longer a separate Lovable-backed local mode.

## Lovable

This repo is still connected to Lovable, and `lovable-tagger` still runs in dev mode —
that is a Vite plugin dependency, unrelated to which Supabase project is live, and needs
no change. What it no longer does: edits made in the Lovable web editor used to commit
back to this repo *and* run against the Lovable-managed database that was production;
that database is now the retired rollback fallback, so any such edit would not reach the
live site. `README.md` is the Lovable boilerplate and describes that original workflow,
not the deployment pipeline above.
