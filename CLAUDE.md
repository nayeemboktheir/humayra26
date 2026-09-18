# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

TradeOn Global (`tradeon.global`) — a live production storefront that resells 1688.com /
Alibaba wholesale products into Bangladesh. Vite + React 18 + TypeScript SPA, shadcn/ui +
Tailwind, Supabase for auth/data/edge functions, TMAPI (`api.tmapi.top/1688`) as the
upstream product source.

The site has real users, orders and payments. Treat `main` and the Supabase project as
production: `DEPLOY-STAGING.md` notes that even the staging instance shares the same
Supabase project and hits PayStation live.

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

## Two deployments, one codebase

| | Production | Staging |
|---|---|---|
| Branch | `main` | `optimization` (current branch) |
| Path | GitHub Actions → Hostinger FTP ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) | Coolify `dockercompose` ([docker-compose.yml](docker-compose.yml), [Dockerfile](Dockerfile), [Caddyfile](Caddyfile)) |
| Host | `tradeon.global`, static Apache + [public/.htaccess](public/.htaccess) | `trade.botbhai.net`, Caddy behind Coolify's Traefik |
| Search/detail API | Supabase edge functions | Supabase edge functions (self-hosted) |

Both deployments now take the same path: every API call goes to Supabase edge functions.
Staging once ran a Node `cache-api` + Redis in front of search and product detail, selected
by `VITE_API_BASE`; that is gone. The edge functions already cache in Postgres
(`search_cache`, `product_cache`, 12h TTL — measured 3.03s cold vs 0.23s warm), and
maintaining a second copy of the TMAPI mapping had already shipped a production bug.
Staging differs from production only in host, branch and Supabase project.

`server.cjs` is a standalone Node static server + OG-tag injector for product links; it is
not part of either build pipeline above.

`DEPLOY-STAGING.md` is the staging runbook and explains why the compose/Caddy files look
unusual (Traefik owns :80/:443, so no `ports:` and no hostname site block).

Staging no longer shares production's backend. It runs its **own self-hosted Supabase**
at `api.tradeon.global` (`SELFHOST_*` keys in `.env`), so the two stacks have separate
data, storage and edge functions. Production is still the Lovable project below and has
received none of the edge-function work described here; the cutover is planned but not
done.

## Deploying to the self-hosted stack

There is no CLI path and no CI for this — everything is applied by hand on the VPS:

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
- **Storage buckets are not in any migration applied to this stack.** `temp-images` (public)
  must exist or uploaded-image search fails with `Bucket not found`;
  [supabase/selfhost/02_functions_rls.sql](supabase/selfhost/02_functions_rls.sql) creates
  it, but it has gone missing at least once.

**The runtime terminates isolates shortly after the response is sent** — the log says
`early termination has been triggered`. `EdgeRuntime.waitUntil` work only survives if it is
short: a single DB write is fine, a chain of upstream fetches is not. Anything that must
persist has to be written *first*, with enrichment layered on afterwards, and long-running
refresh work belongs in a cron rather than deferred on a request. This silently broke the
`product_cache` write once, making every product view look like a cache miss.

## Backend: Lovable-managed Supabase

The Supabase project (`kcihftfgmsrpcljsbjdj`) is **Lovable Cloud managed** — no dashboard,
no service-role key, no direct connection string. Consequences you will hit:

- `supabase/migrations/*.sql` and `supabase/functions/*` cannot be deployed from this repo
  with the Supabase CLI. Some migrations in the tree are not applied in production.
- `LOVABLE-MIGRATION-PLAN.md` is the plan to move off Lovable onto a self-owned project;
  read it before changing anything about migrations, cron jobs, or edge-function deploys.
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
`VITE_SUPABASE_PROJECT_ID` — the same three for both deployments. `TMAPI_TOKEN` and the
other upstream secrets belong on the Supabase project (edge-function environment), not in
the frontend build. `TMAPI_TOKEN` is billed per token — reuse the existing one, never
provision a second.

`.env.selfhost` (gitignored) points a local build at the self-hosted stack:
`bun run dev:selfhost` / `bun run build:selfhost`.

## Lovable

This repo is still connected to Lovable; `lovable-tagger` runs in dev mode and edits made
in Lovable commit back to the repo. `README.md` is the Lovable boilerplate and describes
that workflow, not the deployment pipelines above.
