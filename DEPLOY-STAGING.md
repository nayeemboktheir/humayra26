# Staging deploy — trade.botbhai.net (VPS)

A parallel, independent instance for testing performance work before it touches
`tradeon.global`. Nothing in this document affects the production Hostinger/Lovable
deployment — that still runs through `.github/workflows/deploy.yml` exactly as before.

## What this is

```
Caddy (TLS, :80/:443)
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

## Prerequisites on the VPS

- Docker Engine + the Compose plugin (`docker compose version` should work)
- Ports 80 and 443 open and not already bound by anything else
- DNS: an A record for `trade.botbhai.net` pointing at this VPS's public IP. Caddy
  requests a Let's Encrypt certificate automatically the first time it starts — if the
  DNS record isn't propagated yet, that request just fails and retries; it is not fatal.

## 1. Get the code onto the VPS

Any method that lands this repository's contents in a directory on the VPS works. Two
common options:

```bash
# Option A — git (if this repo has a remote the VPS can reach)
git clone <your-remote-url> tradeon && cd tradeon

# Option B — rsync from your machine (works regardless of git hosting)
rsync -az --delete \
  --exclude node_modules --exclude cache-api/node_modules --exclude dist \
  --exclude .git \
  ./ user@your-vps:/opt/tradeon/
ssh user@your-vps
cd /opt/tradeon
```

## 2. Configure secrets

```bash
cp staging.env.example staging.env
nano staging.env
```

Fill in:
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` —
  copied verbatim from your local `.env` (same production Supabase project).
- `TMAPI_TOKEN` — the same token already used by the Supabase edge functions (Lovable
  secrets → `TMAPI_TOKEN`). Do not request a second one; TMAPI billing is per-token.

`staging.env` is gitignored. Never commit it.

## 3. Build and start

```bash
docker compose --env-file staging.env up -d --build
```

First run pulls `node:20-alpine`, `caddy:2-alpine`, `redis:7-alpine`, builds the frontend
and cache-api images, and Caddy requests its TLS certificate. Expect this to take a few
minutes the first time.

## 4. Verify

```bash
# Containers healthy?
docker compose ps

# cache-api + Redis reachable through Caddy's proxy
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

## 5. Logs / troubleshooting

```bash
docker compose logs -f frontend      # Caddy: TLS issuance, request errors
docker compose logs -f cache-api     # TMAPI calls, cache read/write failures
docker compose logs -f redis
```

If TLS issuance is stuck (DNS not propagated yet, or you're iterating quickly and
hitting Let's Encrypt's rate limit), switch to the staging CA while you debug — uncomment
the `acme_ca` line at the top of `Caddyfile`, then:

```bash
docker compose up -d --build frontend
```

Switch it back (delete/comment that line) once DNS and the setup are confirmed working,
then rebuild once more to get a real, browser-trusted certificate.

## 6. Redeploy after a code change

```bash
git pull   # or re-rsync
docker compose --env-file staging.env up -d --build
```

Compose only rebuilds images whose inputs changed, so this is safe to run after any
change, however small.

## 7. Tear down

```bash
docker compose down          # stop and remove containers, keep volumes (Redis data, TLS certs)
docker compose down -v       # also remove volumes — next start re-issues a TLS cert from scratch
```

## Rollback

There is nothing to roll back — this instance is entirely separate from production.
`docker compose down` at any time simply removes it; `tradeon.global` is unaffected
throughout.
