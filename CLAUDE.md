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
| Search/detail API | Supabase edge functions | local `cache-api` + Redis |

`VITE_API_BASE` is the switch. When set (staging only), `alibaba1688Api.search` and
product detail call `/api/*` on the cache-api container; when unset (production) the same
methods call Supabase edge functions. See
[src/lib/api/alibaba1688.ts:6](src/lib/api/alibaba1688.ts#L6). Everything else — auth,
orders, wallets, admin — always goes straight to Supabase in both deployments.

`server.cjs` is a standalone Node static server + OG-tag injector for product links; it is
not part of either build pipeline above.

`DEPLOY-STAGING.md` is the staging runbook and explains why the compose/Caddy files look
unusual (Traefik owns :80/:443, so no `ports:` and no hostname site block).

## Backend: Lovable-managed Supabase

The Supabase project (`kcihftfgmsrpcljsbjdj`) is **Lovable Cloud managed** — no dashboard,
no service-role key, no direct connection string. Consequences you will hit:

- `supabase/migrations/*.sql` and `supabase/functions/*` cannot be deployed from this repo
  with the Supabase CLI. Some migrations in the tree are not applied in production.
- `LOVABLE-MIGRATION-PLAN.md` is the plan to move off Lovable onto a self-owned project;
  read it before changing anything about migrations, cron jobs, or edge-function deploys.
- `cache-api/src/tmapiMap.js` is a hand-maintained port of the mapping logic in
  `supabase/functions/alibaba-1688-cached-search` and `.../alibaba-1688-item-get`, so both
  paths return byte-identical JSON. There is no shared module between the Deno edge
  functions and the Node service — **edit both when the TMAPI mapping changes.**

Most `alibaba-1688-*`, `firecrawl-*`, `paystation-*` and SMS functions run with
`verify_jwt = false` ([supabase/config.toml](supabase/config.toml)); `admin-send-sms` is
the JWT-verified exception.

Key tables (see [src/integrations/supabase/types.ts](src/integrations/supabase/types.ts),
which is generated — do not hand-edit): `orders`, `shipments`, `profiles`, `wallets`,
`transactions`, `refunds`, `cart_items`, `wishlist`, `user_roles`, `role_permissions`,
`app_settings`, `search_cache`, `category_products`, `trending_products`. RPCs include
`get_my_role`, `get_category_products`, `has_role`, `get_shipment_stage_counts`.

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

## Styling

Tailwind with CSS-variable design tokens defined in [src/index.css](src/index.css) and
mapped in [tailwind.config.ts](tailwind.config.ts). Use semantic classes
(`bg-background`, `text-muted-foreground`, `border-border`) rather than raw color values;
dark mode is class-based.

## Environment

`.env` (gitignored) needs `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
`VITE_SUPABASE_PROJECT_ID`. Staging adds `VITE_API_BASE`, `TMAPI_TOKEN`, `REDIS_URL` and
the cache-tuning vars documented in `staging.env.example` and `cache-api/.env.example`.
`TMAPI_TOKEN` is billed per token — reuse the existing one, never provision a second.

## Lovable

This repo is still connected to Lovable; `lovable-tagger` runs in dev mode and edits made
in Lovable commit back to the repo. `README.md` is the Lovable boilerplate and describes
that workflow, not the deployment pipelines above.
