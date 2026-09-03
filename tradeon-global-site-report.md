# Tradeon.global — Site Performance & Infrastructure Report
*Compiled September 3, 2026 · **Revised September 3, 2026** after direct measurement*

> **Revision note.** The original report was written from Cloudflare analytics and schema
> inspection. This revision adds direct measurement: live HTTP header inspection, timed
> edge-function calls from Dhaka, and `pg_stat_statements` + row-level queries against the
> production database. Two conclusions changed materially — see §5 and §6.
>
> Database figures were captured via the Lovable MCP connector while it was live; that
> connector has since disconnected, so they are a point-in-time snapshot.

---

## 1. Overview

Tradeon.global is an AliExpress/1688 product aggregator that lets Bangladeshi customers browse
and order Chinese marketplace products with prices shown in BDT. Built in Lovable
(Vite + React + TypeScript + shadcn/ui) with **Lovable Cloud** as the backend (a fully-managed
Supabase instance not directly accessible outside Lovable). The frontend is served via
**Hostinger**, with **Cloudflare** proxying DNS and providing an edge layer.

---

## 2. Architecture Summary

| Layer | Provider | Notes |
|---|---|---|
| DNS / Edge proxy | Cloudflare | Proxied for `tradeon.global` and `www` |
| Static hosting | Hostinger | Vite build FTP'd to web root, served by **Apache** |
| Backend / DB | Lovable Cloud (managed Supabase) | No dashboard, connection string, or service-role key |
| Product data source | TMAPI (1688) | Live external calls |
| Email | Resend + Amazon SES | Unrelated to performance |
| Framework | Vite + React + TypeScript + shadcn/ui | Hashed asset filenames |

**Correction to the original report:** production headers are governed by
[`public/.htaccess`](public/.htaccess) (Apache), **not** by `server.cjs`. `server.cjs` is a Node
server that does not run on this deployment — a fix applied there has no production effect.
This mattered; see §5.

---

## 3. Traffic Snapshot (Last 30 Days, Cloudflare Analytics)

| Metric | Value |
|---|---|
| Unique visitors | 7.34k |
| Total requests | 1.01M |
| Requests per visitor | ~137 |
| Percent cached (edge) | 29.26% |

**Both anomalies are now explained** — see §5. Note that product images
(`cbu01.alicdn.com`) and Supabase API calls bypass Cloudflare entirely, so the 1.01M is
almost entirely first-party static assets. 137 static-asset requests per visitor is
extraordinary for a two-chunk SPA, and is the signature of caching being actively defeated.

---

## 4. Measured Baseline

Timed from Dhaka against live production.

| Path | Measured |
|---|---|
| `tradeon.global` TTFB | 566 ms |
| JS delivered | **308 kB gzip** across 2 chunks |
| Supabase network RTT | **237 ms** |
| **TMAPI upstream call** | **2,500–3,400 ms** |
| Product images per full homepage | up to **264**, all full-resolution |

Database (`pg_stat_statements`, mean execution time):

| Query | Mean | Calls |
|---|---|---|
| `search_cache` read (main cache hit) | **1.7 ms** | 12,703 |
| `category_products` (homepage) | **4.8 ms** | 6,050 |
| `cart_items` | 4.5 ms | 23,459 |
| `orders` by user | 15.1 ms | 1,398 |
| `orders` unbounded (admin) | 68.5 ms | 422 |

**The database is not the bottleneck.** It answers in single-digit milliseconds. Every second
of user-visible latency comes from network round-trips, upstream API calls, or re-downloading
assets that should have been cached.

---

## 5. 🔴 Primary Finding — the browser cache is purged on every page load

Live production response headers:

```http
GET /            →  clear-site-data: "cache"
GET /index.html  →  clear-site-data: "cache"
GET /sw.js       →  clear-site-data: "cache", "storage", "executionContexts"
```

`Clear-Site-Data: "cache"` instructs the browser to discard its **entire HTTP cache for the
origin**, and it fires on every page load. This completely defeats the
`Cache-Control: public, max-age=31536000, immutable` set on the hashed build assets — every
visitor re-downloads all 308 kB of JS, the CSS, and the fonts on **every single visit**.

Source: the final two `FilesMatch` blocks in [`public/.htaccess`](public/.htaccess).

This single misconfiguration accounts for both traffic anomalies in §3:

- **137 requests/visitor** — nothing is ever reused between visits
- **29% edge cache ratio** — confirmed independently: hashed assets return
  `cf-cache-status: MISS`, so Cloudflare is not caching them either

It is also the largest contributor to the 5–20 s page loads, because it degrades *every* page
view for *every* visitor, not just product interactions.

### 🔴 Related: `/sw.js` is silently logging users out

`/sw.js` returns HTTP 200 and carries `Clear-Site-Data: "cache", "storage", "executionContexts"`.
The `storage` directive wipes localStorage — which is exactly where the Supabase auth session
is kept (`storage: localStorage` in `src/integrations/supabase/client.ts`).

The file is a self-destruct service worker (clears caches, force-navigates clients with a
`cache_bust` param, unregisters itself). Any browser still holding that registration re-fetches
the script periodically for updates, and that response **logs the user out and force-reloads
the page**. This is intermittent and hard to reproduce, and is a plausible cause of reported
instability.

---

## 6. Secondary Finding — caching exists but barely functions

### `search_cache` — 1% hit rate

**Correction to the original report:** `search_cache` *does* have a TTL. It is 12 hours,
enforced in application code (`CACHE_TTL_HOURS` in
`supabase/functions/alibaba-1688-cached-search/index.ts`, applied as
`.gte('updated_at', cutoff)`), not as a schema column — which is why it wasn't visible in the
table definition. The cache **is** read before calling TMAPI.

The real problem is that it almost never hits:

```text
search_cache:  28,675 rows
  fresh within the 12h TTL:     300   ←  1.0%
  within 7 days:              9,555   ←  33%
  table size:                 133 MB  (84% of the 159 MB database)
```

**~99% of searches pay the full 2.5–3.4 s TMAPI round trip.** Raising the TTL to 7 days lifts
the hit rate to 33% immediately; adding stale-while-revalidate (serve cached, refresh in
background) makes effectively every repeat search instant. The table is also never pruned,
which is why it has grown to 84% of the database.

### No product detail cache — confirmed

The original report was right. There is no product cache in production, so **every** product
page view triggers a live TMAPI call. Worse, the product-detail edge function makes **two
sequential** upstream hops: `item_detail`, then a fetch of the full 1688 detail HTML page
(which can be ~1 MB).

A `product_cache` table and cache-aside logic have already been written
(`supabase/migrations/20260824120000_product_detail_cache.sql`) but **were never applied** —
see §8.

### No client-side request caching

Answering open question 6: React Query is installed but **completely unused** —
**0 `useQuery` and 0 `useMutation` call sites**. `new QueryClient()` is constructed with no
defaults. All 36 page/component files hand-roll `useEffect` + `useState`, so nothing is
deduplicated or cached across component mounts and navigations.

---

## 7. Original Open Questions — Answered

| # | Question | Answer |
|---|---|---|
| 1 | Is `search_cache` read before the API call? | **Yes** — read first, 12h TTL. But only 1.0% of lookups hit. |
| 2 | How stale can prices be? | Business decision. Data: 12h → 1% hit rate; 7d → 33%. Highest-leverage knob available. |
| 3 | Unique products viewed per day? | Not measurable without `product_cache`. Proxy: `search_cache` grows ~3k rows/day. |
| 4 | Lighthouse / CWV data? | Measured (§4): TTFB 566 ms, 308 kB JS re-downloaded every visit, up to 264 full-res images per homepage. |
| 5 | Hostinger tier? | Not the bottleneck. Origin TTFB is acceptable; caching configuration is the issue. |
| 6 | Client-side caching? | **None.** React Query installed but unused (§6). |

---

## 8. Deployment Gap

A set of performance fixes exists in the repository but only partially reached production,
because Lovable is currently the only thing that can deploy migrations and edge functions.

| Fix | Status |
|---|---|
| Code splitting (633 kB → 308 kB gzip) | ✅ **live** |
| `product_cache` table + cache-aside | ❌ not deployed |
| 15 hot-path indexes | ❌ not deployed (1 of 15 applied) |
| RLS `auth.uid()` hoisting | ❌ not deployed (47 policies still per-row) |
| Image CDN sizing (78% smaller) | ❌ not deployed |
| `get_my_role` / `get_category_products` / `get_shipment_stage_counts` | ✅ live |

The production schema is therefore **inconsistent** — three functions are live while the table,
indexes, and policy rewrite that accompany them are not.

---

## 9. Recommendations (Revised Priority Order)

| Pri | Action | Effort | Impact |
|---|---|---|---|
| 🔴 1 | Remove both `Clear-Site-Data` blocks from `public/.htaccess` | ~2 lines | Repeat visits stop re-downloading 308 kB. **Largest single win.** |
| 🔴 2 | Delete `sw.js` from `public/` and from the Hostinger web root | 1 file | Stops intermittent logout + forced reload |
| 🟠 3 | Cloudflare Cache Rule: `/assets/*` → Cache Eligible, Edge TTL 1 month | ~10 min | Fixes `cf-cache-status: MISS`; safe because filenames are hashed |
| 🟠 4 | Deploy `product_cache` + cache-aside | written | 2.5–3.4 s → ~250 ms on repeat product views |
| 🟠 5 | `search_cache`: TTL 12h → 7d, add stale-while-revalidate, prune old rows | small | 1% → 33% hit rate; reclaims ~130 MB |
| 🟡 6 | Deploy image CDN sizing | written | 78% smaller images, up to 264 per homepage |
| 🟡 7 | Deploy indexes + RLS migrations | written | DB already fast; do it for headroom and consistency |
| 🟡 8 | Adopt React Query (or reuse the existing module cache) for client-side dedup | medium | Removes redundant refetches on every mount |
| 🟢 9 | Migrate off Lovable Cloud to own Supabase in **ap-south-1** | large | Control, observability — **plus** 237 ms → ~50 ms RTT |
| ⚪ 10 | Redis | — | **Not yet.** Postgres cache reads are 1.7 ms; Redis would save ~1 ms. Revisit when connection concurrency, not latency, is the constraint. |

Items 1–3 are configuration-only, carry no code risk, and can ship immediately. Together they
address the dominant cause of slow page loads. Items 4–7 are already written and only need a
deploy path.

---

## 10. Suggested Immediate Next Step

Ship items 1, 2 and 3 today — they are the highest impact-to-effort actions available and
require no code changes. Then establish a deploy path for items 4–7, which are already written
but blocked behind Lovable.

The Lovable migration (item 9) should follow, not precede, the performance work: it is a
control and latency improvement, but it is not what stands between the site and a 1–2 s load
time.
