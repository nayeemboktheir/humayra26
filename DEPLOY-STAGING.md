# Staging deploy — trade.botbhai.net (Coolify)

A parallel, independent instance for testing performance work before it touches
`tradeon.global`. Nothing in this document affects the production Hostinger/Lovable
deployment — that still runs through `.github/workflows/deploy.yml` exactly as before.

Deployed via **Coolify** (`build_pack: dockercompose`), pointed at this repo's
`optimization` branch. Coolify runs its own Traefik reverse proxy, which already owns
host ports 80/443 and handles TLS — that shapes several things below that would look
different on a bare VPS.

## What this is

```
Traefik (Coolify's proxy — TLS, :80/:443, owns the domain)
 └─ frontend (Caddy, internal :80 only)
     ├─ /              → the built SPA (Vite dist/), correct cache headers, no Clear-Site-Data
     └─ /api/*         → reverse-proxied to cache-api
                            cache-api → Redis (cache-aside + stale-while-revalidate)
                                      → TMAPI (only on a cache miss)
```

Everything else — auth, orders, wallets, admin, the 20 edge functions not covered here —
still talks straight to the same Lovable-managed Supabase project the production site
uses. This build only changes **where search and product-detail results are cached**.

## ⚠️ Before you start

- **Staging shares production data.** It points at the same Supabase project as
  `tradeon.global`. A signup here creates a real user among the 597 that already exist;
  placing an order writes a real row into `orders`. Treat it as a second window onto the
  same store, not a sandbox.
- **Do not run checkout to completion.** `payment/callback` hits PayStation live.
- **Auth email links may not resolve.** `emailRedirectTo` is `window.location.origin`
  (`https://trade.botbhai.net`), and Supabase only honours redirect URLs on its
  allow-list. That list lives in the Lovable-managed project settings — add the staging
  origin there if you need signup/reset emails to work, or just don't test those flows
  yet.

## Why `docker-compose.yml` and `Caddyfile` look the way they do

Two things are shaped by running behind Coolify's Traefik rather than standing alone:

- **No `ports:` on the `frontend` service** — only `expose: ["80"]`. Publishing `80:80`/
  `443:443` to the host, as a standalone Caddy setup normally would, collides with
  Traefik, which is already bound to those ports. This is exactly what caused the first
  deploy attempt to crash-loop (`port is already allocated`).
- **Caddy listens on plain `:80`, not `trade.botbhai.net {...}`** — a hostname site
  address makes Caddy request its own Let's Encrypt certificate via ACME. Traefik already
  does that once you assign the domain in Coolify's UI (see step 2), so Caddy would
  either fail to bind 80/443 for its own ACME challenge or end up racing Traefik for the
  same certificate. Caddy here only serves HTTP internally; Traefik does the public
  HTTPS side.

## 1. Confirm the Coolify application

This should already exist (`build_pack: dockercompose`, repo `nayeemboktheir/humayra26`,
branch `optimization`, compose file at the repo root). If you're starting from scratch in
Coolify: **New Resource → Docker Compose**, point it at this repo/branch, base directory
`/`, compose location `/docker-compose.yml`.

## 2. Environment variables

Set these in Coolify's **Environment Variables** tab for the application (not a
`.env` file you upload — Coolify generates one from what's configured there and passes
it to `docker compose` at deploy time):

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` —
  copied verbatim from your local `.env` (same production Supabase project).
- `TMAPI_TOKEN` — the same token already used by the Supabase edge functions (Lovable
  secrets → `TMAPI_TOKEN`). Do not request a second one; TMAPI billing is per-token.
- Optionally the cache tuning vars (`SEARCH_FRESH_MS`, `SEARCH_TTL_SEC`,
  `PRODUCT_FRESH_MS`, `PRODUCT_TTL_SEC`, `TMAPI_TIMEOUT_MS`, `DETAIL_PAGE_TIMEOUT_MS`) —
  compose falls back to sensible defaults (see `cache-api/.env.example`) if you leave
  them unset.

`staging.env.example` in the repo documents the same keys for reference, and still
applies if you ever run this stack on a bare VPS instead of through Coolify — see
"Running this without Coolify" at the bottom.

## 3. Assign the domain

In the Coolify UI, open this application → **Domains**, select the `frontend` service,
port `80`, and set the FQDN to `trade.botbhai.net`. Coolify/Traefik requests the Let's
Encrypt certificate itself once this is saved and the app is (re)deployed — there is
nothing to configure in `Caddyfile` for this.

DNS: an A record for `trade.botbhai.net` must point at the Coolify server's public IP.
(This was already confirmed live during setup — `trade.botbhai.net` resolves to
`72.61.248.65`.)

## 4. Deploy

Trigger a deploy from the Coolify UI (or push to the `optimization` branch, if this
application has auto-deploy enabled). Coolify runs `docker compose up -d --build` for
you — first run pulls `oven/bun:1-alpine`, `caddy:2-alpine`, `redis:7-alpine`, and builds
the frontend and cache-api images.

## 5. Verify

```bash
# cache-api + Redis reachable through the proxy chain
curl -s https://trade.botbhai.net/api/healthz
# -> {"ok":true,"redis":"up"}

# Cache headers are correct (this is the actual fix for the production bug —
# confirm there is NO Clear-Site-Data header anywhere in this response)
curl -sI https://trade.botbhai.net/ | grep -i cache-control
curl -sI https://trade.botbhai.net/ | grep -i clear-site-data   # must print nothing

# A hashed asset should be aggressively cacheable
ASSET=$(curl -s https://trade.botbhai.net/ | grep -oE '/assets/tradeon-app-[^"]+\.js' | head -1)
curl -sI "https://trade.botbhai.net${ASSET}" | grep -i cache-control
# -> Cache-Control: public, max-age=31536000, immutable
```

Then in a browser: load the homepage, run a search, open a product. On a **second**
search for the same term, the response should come back near-instantly — check
`cacheStatus` in the network tab's response body (`"hit"` or `"stale"` rather than
`"miss"`).

## 6. Logs / troubleshooting

Use Coolify's own log viewer for the application (per-service: `frontend`, `cache-api`,
`redis`), or its MCP/API deployment tooling if you're driving this from an agent.

- **`port is already allocated`** — a service in `docker-compose.yml` is publishing a
  host port that collides with Traefik (or anything else already bound on the Coolify
  server). Only `frontend` should ever need `expose:`, never `ports:`.
- **Certificate not issuing / domain not resolving** — check the Domains tab, confirm
  the FQDN is saved against the `frontend` service on port 80, and confirm DNS actually
  resolves to the Coolify server's IP.
- **`/api/*` calls fail but `/` loads fine** — check `cache-api` logs for a startup
  failure; the service exits immediately if `TMAPI_TOKEN` is unset (see `src/server.js`).

## 7. Redeploy after a code change

Push to the `optimization` branch (if auto-deploy is on) or trigger a redeploy from the
Coolify UI. Compose only rebuilds images whose inputs changed, so this is safe after any
change, however small.

## 8. Tear down

Delete or stop the application from the Coolify UI. There is nothing to roll back —
this instance is entirely separate from production; `tradeon.global` is unaffected
throughout its lifecycle.

---

## Running this without Coolify (bare VPS)

The compose file as committed is shaped for Coolify (no host port bindings, Caddy on
plain HTTP). To run it standalone instead — publishing ports and letting Caddy manage
its own TLS — you'd need to reverse both adjustments described above:

1. In `docker-compose.yml`, change the `frontend` service's `expose: ["80"]` back to
   `ports: ["80:80", "443:443"]`, and add back `caddy_data`/`caddy_config` volumes
   mounted at `/data` and `/config` (so the certificate persists across restarts).
2. In `Caddyfile`, change the site address from `:80` to `trade.botbhai.net` so Caddy's
   automatic HTTPS takes over.
3. Use `staging.env.example` → `staging.env` and
   `docker compose --env-file staging.env up -d --build` directly on the VPS, with ports
   80/443 free and DNS pointed at that VPS.
