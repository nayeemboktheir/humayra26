# Storefront performance: benchmark, fixes and follow-on work

Started as a competitor benchmark (tradeon vs. chinaonlinebd vs. skybuybd) and grew into the
work that came out of it. Parts 1–3 are the original investigation; Parts 4–9 are what was
changed, deployed and measured afterwards.

**Date:** 2026-09-18 / 2026-09-19
**Method:** Playwright, headed Chromium, real network conditions (no throttling applied),
plus direct HTTP benchmarking of the edge functions.
**Sites tested:**
- tradeon (ours) — `https://trade.botbhai.net`
- chinaonlinebd — `https://www.chinaonlinebd.com`
- skybuybd — `https://skybuybd.com`

**Keywords tested (search → click into a product, one full pass each):** red shirt, blue
shirt, black pant, white sneakers, kitchen knife, leather bag, denim jacket.

**Outcome:** cold product-detail clicks went from **5–11s to ~300ms** for catalogued
products (~180ms to first paint). See Parts 6 and 7.

## TL;DR (the original finding)

- **Search results load time is roughly competitive.** tradeon is a few hundred ms to ~1s
  behind on some queries, ahead on others. Not the main problem.
- **Product detail pages are the real gap.** Across every keyword tested, clicking into a
  tradeon product took **5–11 seconds** to show a price. Both competitors showed theirs in
  **under 70 milliseconds**, every time.
- Root cause: [`supabase/functions/alibaba-1688-item-get/index.ts`](supabase/functions/alibaba-1688-item-get/index.ts)
  does a **fully serial** chain of upstream calls on any cache miss — TMAPI `item_detail`,
  then a full HTML page scrape of the 1688 detail page, then a shop-count call — before
  responding. `product_cache` has a 12h TTL, so most real customer clicks land on a product
  nobody has viewed recently and pay the full cold cost.
- Secondary, smaller finding: the initial JS bundle (~1MB, `tradeon-chunk` + `tradeon-app`)
  must fully download and execute before *any* data fetch fires, adding ~650ms of dead time
  before search even starts. `Index.tsx` also fires two data-heavy queries
  (`trending_products`, `get_category_products`) unconditionally on mount, even when the
  page is landing directly on a search URL and will never show that content.

## Metric used

"Time to product visible" = wall-clock time from navigation/click until the string
`৳<digit>` (a BDT price) is present in `document.body.innerText`, polled every 100–300ms.
For the search page, this is additionally tracked until the price count **stabilizes**
(stops changing for 1.2–1.5s) to approximate "full grid loaded," not just "first item
appeared."

## Part 1 — Initial investigation: "red shirt"

### First pass (browser `load` event — later found to be misleading)

| Site | Wall-clock `load` | DOMContentLoaded | First Contentful Paint | TTFB | Requests | Total transfer |
|---|---|---|---|---|---|---|
| tradeon | 551ms | 458ms | 856ms | 179ms | 37 | 2,355KB |
| chinaonlinebd | 3,072ms | 651ms | 904ms | 416ms | 196 | 7,600KB |
| skybuybd | 868ms | 689ms | 784ms | 490ms | 149 | 6,600KB |

By this metric tradeon looked *fastest*. That's because tradeon is a pure client-side SPA:
the `load` event fires on an empty shell, long before real product data has fetched and
rendered. This metric doesn't reflect what a user actually sees, so it was discarded in
favor of "time to product visible."

### Second pass — time to first product visible (3 trials/site, median)

| Site | Median time to first product | Total transfer |
|---|---|---|
| **tradeon** | **988ms** | 2,355KB |
| chinaonlinebd | 733ms | 7,140KB |
| **skybuybd** | **374ms** | 6,175KB |

tradeon is **2.6x slower than skybuybd** and **1.3x slower than chinaonlinebd** despite
shipping **~3x less data**. This rules out "we're too heavy" — the problem is the request
waterfall, not payload size.

### Waterfall trace (why tradeon is slow to start)

```
0ms      navigation starts, ~3KB empty HTML shell
189ms    tradeon-app.js + tradeon-chunk.js (848KB) start downloading
580ms    both scripts finish downloading            [391ms — download]
846ms    first data fetch finally fires (5 parallel calls)  [266ms — parse/execute/mount, ZERO fetches in flight]
1214ms   all 5 API calls resolve                     [368ms — parallel API round-trip]
~1300ms  React renders products, paint happens
```

**~660ms is spent purely getting JS downloaded, parsed and executed before a single data
request is sent.** That dead zone, not network latency, is the dominant cost on the search
page.

The 5 parallel calls that fire at ~846ms:
- `rest/v1/app_settings?select=key,value&key=in.(cny_to_bdt_rate,price_markup_percentage)` — 739ms
- `functions/v1/alibaba-1688-cached-search` (the actual search) — 830ms
- `rest/v1/app_settings?select=key,value` (full table) — duplicate of the call above, different filter
- `rest/v1/trending_products?...&limit=24` — 599ms, **not needed on a search-results view**
- `rest/v1/rpc/get_category_products` — 598ms, 146.8KB payload, **not needed on a search-results view**

Largest payloads on this page load: `tradeon-chunk.js` (848KB), Facebook Pixel config
script (482KB), `fbevents.js` (412KB) — **~900KB combined just for Meta tracking**,
`tradeon-app.js` (188KB), `get_category_products` response (147KB).

### Code-level confirmation of the wasted queries

[`src/pages/Index.tsx:224`](src/pages/Index.tsx#L224) (`trending_products`) and
[`src/pages/Index.tsx:281`](src/pages/Index.tsx#L281) (`get_category_products`) both fire
unconditionally in `useEffect` on mount. Separately,
[`src/pages/Index.tsx:961-970`](src/pages/Index.tsx#L961-L970) fires `performSearch` off
the `?q=` URL param. When a user lands directly on `?q=red+shirt`, all three fire — two of
them for homepage content the user will never see on this route.

`app_settings` is also fetched twice with different filters in the same load — an avoidable
duplicate round trip.

## Part 2 — Product detail pages: the real gap

### "black pant" — full flow, corrected click methodology

| Site | Search grid stabilized | Click → URL change | Detail: first price | Detail: fully stable |
|---|---|---|---|---|
| tradeon | 2,345ms (27 items) | 2ms | **6,527ms** | **7,777ms** |
| chinaonlinebd | 1,573ms (50 items) | 1ms | 2ms | 1,856ms |
| skybuybd | 2,301ms (82 items) | 1ms | 2ms | 1,250ms |

### Isolating the cause: cold vs. warm cache, same product

Tested directly against a never-before-viewed product
(`https://trade.botbhai.net/?product=977608980816`, from query "olive cargo jacket"):

| Visit | Time to price visible | `alibaba-1688-item-get` duration | HTTP status |
|---|---|---|---|
| Cold (first visit) | **6,843ms** | **6,773ms** | 200 |
| Warm (immediate revisit) | 347ms | 231ms | 200 |

**A 20x difference**, isolated entirely to the edge function call itself. Once a product is
cached (product_cache, 12h TTL), it's fast. Until then, it's not.

### Root cause — [`supabase/functions/alibaba-1688-item-get/index.ts`](supabase/functions/alibaba-1688-item-get/index.ts#L232-L257)

On a cache miss, the function runs **fully serially**:

1. `fetchWithTimeout(TMAPI item_detail, timeoutMs=12000)` — the core product JSON
2. **Then**, only after step 1 resolves: `Promise.all([fetchDetailImages(...), fetchShopProductCount(...)])`
   - `fetchDetailImages` doesn't call an API — it **fetches the entire 1688 product HTML
     detail page and regex-scrapes it** for description images (`timeoutMs=4000`)
   - `fetchShopProductCount` is a second TMAPI call (`timeoutMs=4000`)
3. Only after *both* of those resolve does the function build the response and reply.

Worst case is theoretically up to 16s (12s + 4s); observed cold hits consistently landed at
5–11s across every keyword tested. For comparison, `CLAUDE.md` already documents the
`search_cache` cold/warm gap as 3.03s vs 0.23s — `product_cache`/item-get's cold path is
worse than that, and unlike search queries (which repeat across users), individual product
IDs are far less likely to already be warm when a specific customer clicks one.

### Reproduction across every keyword tested (single pass, no retries)

| Keyword | tradeon: search stabilized | tradeon: detail first price | chinaonlinebd: detail first price | skybuybd: detail first price |
|---|---|---|---|---|
| black pant | 2,345ms | 6,527ms | 2ms | 2ms |
| white sneakers | 2,484ms | 11,202ms | 30ms | 46ms |
| kitchen knife | 2,548ms | 7,167ms | 29ms | 39ms |
| leather bag | 2,558ms | 4,981ms | 20ms | 36ms |
| denim jacket | 1,890ms | 5,275ms | 24ms | 69ms |

**tradeon detail-page average: ~7.0s. Competitor average: ~21–38ms.** Every keyword, every
product, same result — this is not noise, it's the standard cold-cache path that most real
customers hit on their first click into any given product.

## Part 3 — Direct edge-function benchmark (self-hosted VPS, `api.tradeon.global`)

The tests above go through a browser. This part calls the Supabase edge functions on the
self-hosted VPS directly over HTTP (`POST https://api.tradeon.global/functions/v1/<fn>`,
using the anon key, no browser involved) to isolate backend latency from any
frontend/rendering overhead. Payment (`paystation-*`) and message-sending functions
(`send-sms-otp`, `verify-sms-otp`, `send-shipment-sms`, `admin-send-sms`,
`send-invoice-email`) were **not** invoked — those hit live production systems (real
payment gateway, real SMS/email costs) and aren't safe to load-test ad hoc.

### `tmapi-keyword-search` — broken, and already dead code

This was the function specifically asked about. It responds fast (191–1,508ms) with
`success: true`, but returns **zero items for every keyword tested** (`green blazer`,
`wireless earbuds`, `yoga mat` all came back `items: 0, total: 0`) — the TMAPI response
mapping in this function no longer matches what `global/search/keyword` actually returns.
Separately, `searchByKeywordTmapi()` in
[`src/lib/api/alibaba1688.ts:81-90`](src/lib/api/alibaba1688.ts#L81-L90) — the only
frontend code that calls this function — is itself never called from anywhere in the app
(confirmed by search; `Index.tsx` only calls `alibaba1688Api.search`, which uses
`alibaba-1688-cached-search`). This function is currently unused *and* broken. Low
priority to fix given it's dead, but worth deleting or fixing so it doesn't silently bit-rot
further or get wired up later while broken.

### `alibaba-1688-cached-search` — the function actually in use, cold vs. warm

| | Time | Items returned |
|---|---|---|
| "green blazer" (cold) | 2,174ms | 20 (2,000 total) |
| "wireless earbuds" (cold) | 1,922ms | 20 (2,000 total) |
| "yoga mat" (cold) | 1,678ms | 20 (2,000 total) |
| "green blazer" (warm, repeat) | 64ms | 20 |
| "wireless earbuds" (warm, repeat) | 67ms | 20 |
| "yoga mat" (warm, repeat) | 64ms | 20 |

~30x cold/warm gap, consistent with the documented `search_cache` figures. This matches
what Part 1 already found at the browser level — search itself isn't the main problem once
warm, and even cold it's nowhere near as bad as product detail.

### `alibaba-1688-item-get` — confirms Part 2's finding at the backend level

Called directly (bypassing the browser entirely) against a fresh, never-before-fetched
product ID (`1001757392099`):

| | Time |
|---|---|
| Cold | 3,791ms |
| Warm (immediate repeat) | 58ms |

**65x difference**, isolated purely to the edge function — no frontend, no rendering, no
browser JS involved. This directly corroborates the root cause already identified in
Part 2: the serial `item_detail` → HTML-scrape → shop-count chain on cache miss.

### `alibaba-1688-shipping-fee` — slow, and uncached

A single call for the same product took **2,027ms**. This function has no caching layer at
all — every call is a live TMAPI round trip. It doesn't block the product-detail price from
rendering (confirmed in Part 2's waterfall trace — it fires after and in parallel with
image loads), but if any UI depends on it synchronously (e.g. a shown delivery estimate),
that specific element will lag by ~2s on every view, every time, with no warm path.

### `alibaba-1688-seller-products` — fine

683ms, returned 20 of 4,515 items for the tested vendor. No issue found.

## Recommended fixes (proposed at the time — all since applied; see Parts 5–9)

1. **Stop blocking the `alibaba-1688-item-get` response on the HTML-scrape and shop-count
   calls.** Respond as soon as `item_detail` resolves (and shop count, since it's
   small/bounded); backfill description images (`fetchDetailImages`) asynchronously via
   `EdgeRuntime.waitUntil` and update `product_cache` afterward — the same deferred-write
   pattern the function already uses for the cache upsert itself. This should cut the cold
   path from ~4–11s down to roughly the `item_detail` call's own latency. This is the
   single highest-impact fix found across both the browser-level and direct edge-function
   tests.
2. Gate the `trending_products` / `get_category_products` effects in `Index.tsx` behind
   `!searchParams.get('q')` so a direct search landing doesn't fire two unused queries.
3. Merge the two `app_settings` calls into a single query.
4. Delete or fix `tmapi-keyword-search` — it's dead code and currently broken (returns 0
   results for every query).
5. Consider adding a cache layer to `alibaba-1688-shipping-fee` (even a short TTL) — it's a
   live, uncached TMAPI call on every single invocation, ~2s every time.
6. *(Bigger, not proposed as an immediate change)* The ~650ms JS-bundle-blocks-first-fetch
   gap is architectural — `Index.tsx` is eagerly loaded per the routing rules in
   `CLAUDE.md` and isn't `lazy()`-eligible, and `manualChunks` is explicitly flagged as
   fragile/intentional in `CLAUDE.md`. Worth a separate discussion, not a quick fix.

## Part 4 — Full edge-function review (all 17 functions)

Every function in `supabase/functions/` was read end to end, looking specifically for the
same class of bug as `alibaba-1688-item-get`: essential work blocked behind non-essential
work on the response path. Two implemented, several flagged but intentionally left alone.

### Fixed

- **`alibaba-1688-item-get`** — see Part 2/3 above. Responds as soon as `item_detail`
  resolves; description-image scrape and shop-count enrichment now run in the background
  and backfill `product_cache` for the next viewer.
- **`paystation-init-payment`** and **`paystation-verify-payment`** — both `await`ed
  `sendMetaCapiEvent(...)` (a Facebook Conversions API call) before responding. In
  `init-payment` this sat between PayStation confirming the transaction and the customer
  getting their `payment_url` — i.e. **on the checkout critical path**. In
  `verify-payment` it sat after the order/transaction/notification DB writes (which
  correctly stay synchronous) but still blocked the "payment confirmed" response back to
  the customer. Both now fire the Meta CAPI call via `EdgeRuntime.waitUntil` and respond
  immediately; `sendMetaCapiEvent` already catches its own errors internally, so nothing
  about analytics can affect payment success/failure either way. No payment logic, order
  logic, or security check was touched in either file.

### Reviewed, issues found but intentionally not changed here

- **`tmapi-keyword-search`** — broken (0 results for every keyword tested) and dead code
  (nothing in the frontend calls it). See Part 3. Needs a decision (fix or delete), not a
  silent change.
- **`alibaba-1688-cached-search`** — the `imageUrl` branch (`isImageSearch`) unconditionally
  returns `{ items: [], total: 0 }` without ever calling anything. The frontend's
  `searchByImageOtapi()` fallback (used when TMAPI image search returns 0 results, see
  `Index.tsx:541-547`) therefore always returns empty. This looks like a leftover stub from
  the OTAPI removal referenced elsewhere in the codebase, not a regression I caused — flagging
  rather than guessing at a reimplementation without knowing if OTAPI is still integrated
  anywhere.
- **`alibaba-1688-shipping-fee`** — single upstream call, nothing to defer or parallelize;
  the only real lever is caching, which needs a new cache table (schema/migration change,
  out of scope for a code-only pass).
- **`alibaba-1688-seller-products`** — up to 3 sequential TMAPI fallback attempts, no
  caching. Not on the product/search hot path tested in Parts 1–3 (only hit from a seller
  storefront view), so left as-is; same caching caveat as shipping-fee if revisited.
- **`alibaba-1688-image-search`** — the temp-upload cleanup (`setTimeout(..., 900000)`,
  i.e. 15 minutes later) isn't wrapped in `EdgeRuntime.waitUntil`, so it may never fire if
  the isolate is recycled after the response — a possible storage leak, not a latency
  issue. Left alone pending confirmation the runtime keeps isolates alive that long either
  way.
- **`admin-send-sms`** — broadcasts (`target: "all"`) loop through up to 2,000 recipients
  **sequentially**, one BulkSMS HTTP call at a time, fully synchronous before responding.
  For a full broadcast this could run many minutes and risks the edge-function timeout.
  Real issue, but fixing it changes the response contract (the admin UI currently gets
  `sent`/`failed` counts synchronously) — needs a decision on the new UX (queued job +
  polling?) rather than a silent behavior change bundled into a performance pass.

### Reviewed, no issue found

`verify-sms-otp`, `send-sms-otp`, `send-shipment-sms`, `send-invoice-email`,
`auth-email-hook`, `phone-password-login`, `refresh-category-products`,
`refresh-trending-products` — every await in these is either security/correctness-critical
(rate limiting, OTP checks, order-status writes, webhook responses GoTrue depends on) or
already a background cron job with no user waiting on it. Nothing to defer without changing
behavior.

### Deployment status

The two new fixes (`paystation-init-payment`, `paystation-verify-payment`) are committed to
source but **not yet deployed** — same blocker as `alibaba-1688-item-get`: deploying to the
self-hosted stack requires SSH access to the VPS (`72.61.248.65`) to run
`supabase/selfhost/deploy-functions.sh`, which this session doesn't have. All three fixed
functions ship together in the next deploy.

## Part 5 — Remaining fixes applied

A second pass cleared everything that was previously flagged-but-not-fixed, after checking
each against `docs/1688 API docs.md`.

### `tmapi-keyword-search` — root cause found and fixed

The function called `GET /1688/global/search/keyword`. **That endpoint does not exist** —
it appears nowhere in the API docs, where `keyword` is only ever a query *parameter*.
Verified directly:

```
OLD path: HTTP 404  {"detail":"Not Found"}
NEW path: HTTP 200  code=200  items=20  total=2000
```

The function treated the 404 body as an empty result set and reported `success: true,
items: []`, which is why it failed silently rather than erroring. Fixed to
`/global/search/items`.

Its response mapper was also wrong for this endpoint — it read `item.price`, `item.sales`
and `item.shop_name`, none of which exist on it, so even once the URL was corrected every
row would have come back with `price: 0`. Rewritten against the field paths the proven
mapper in `alibaba-1688-cached-search` uses. After both fixes: **0 of 20 rows with a zero
price, 0 with a zero id.** Note the function is now correct but still has no callers —
wiring it up or deleting it remains a separate decision.

### `alibaba-1688-cached-search` — image branch no longer a stub

The `imageUrl` branch returned `{ items: [], total: 0 }` without calling anything, so the
frontend's `searchByImageOtapi()` fallback never worked. It now performs a real
`global/search/image` lookup and caches the result. Verified live: **40 items returned, 0
with a zero price**, in ~2.0s cold (then cached).

### `alibaba-1688-item-get` — description images hardened

`fetchDetailImages` (the HTML scrape) now falls back to TMAPI's purpose-built
`/1688/item_desc` endpoint when the scrape returns nothing — which is exactly the case
where scraping has silently broken. Measured on three live products, `item_desc` returned
an identical image set every time and was faster in each case (**472ms vs 3,117ms** on the
worst). It is a billed call and the scrape is free, so it is deliberately *only* a
fallback: no added cost in the happy path, but the description no longer silently empties
out if 1688 changes its markup or blocks the request.

### `alibaba-1688-shipping-fee` — now cached

Was an uncached live TMAPI call on every invocation (~2s, every time). Now cached for 12h,
keyed on `ship:{item}:{province}:{qty}:{weight}` since all four change the quote. Only
successful quotes are cached — a province TMAPI couldn't price is retried rather than
remembered as unavailable. Cache write is deferred off the response path.

### `alibaba-1688-seller-products` — now cached

Same treatment, keyed `seller:{vendorId}:{pageSize}` per page. This matters more here than
the raw latency suggests: on a miss the function walks up to three TMAPI endpoints in
sequence, so a cache hit skips the whole fallback chain.

> Both of the above reuse `search_cache` with a key prefix rather than adding a table. The
> codebase already namespaces that table this way (`img:`, `img2:`), and per `CLAUDE.md` a
> migration can't be deployed to the Lovable-managed project from this repo anyway.

### `alibaba-1688-image-search` — temp-upload leak fixed

Cleanup was a `setTimeout(..., 900000)` registered in the request handler. An edge isolate
is recycled once its response completes, so a timer 15 minutes out was never reliably
reached and uploads accumulated in the bucket forever. Replaced with a sweep of uploads
older than 15 minutes, run on the way *in* — it needs nothing to stay alive after the
response.

### `admin-send-sms` — broadcast no longer serial

A `target: "all"` broadcast looped through up to 2,000 recipients one HTTP call at a time,
which runs for many minutes and can hit the function timeout part-way through a send.
Now uses a fixed pool of 5 workers — still far below anything the gateway would treat as a
flood, and **the response contract is unchanged**: `sent`/`failed` counts are still
returned synchronously once every recipient has been attempted.

### `send-sms-otp`, `send-shipment-sms` — audit writes deferred

Both blocked their response on a best-effort `sms_logs` insert after the SMS had already
left the gateway. Now deferred via `EdgeRuntime.waitUntil`.

### Post-deploy results — Part 6 below supersedes the "not yet deployed" notes above

### Deliberately left alone

- **`refresh-category-products` / `refresh-trending-products`** — the sequential loop and
  500ms sleep are intentional TMAPI rate-limiting in a nightly cron with no user waiting.
  Parallelising them would trade a non-problem for a rate-limit risk.
- **`verify-sms-otp`, `phone-password-login`, `auth-email-hook`, `send-invoice-email`** —
  every await is security- or correctness-critical, or a webhook response GoTrue depends
  on. Nothing deferrable.
- **The 8 other unused documented endpoints** (`item_detail_by_url`, `item/rating`,
  `search/items`, `search/factories`, `shop/category`, `category/info`, `category/items`,
  `category/items/v2`) are features, not performance. The one arguable case is
  `category/items/v2` replacing the keyword-search approach in `refresh-category-products`
  — an accuracy improvement for a background cron, not a speed one.

## Part 6 — Deployed, and measured again

All 17 functions deployed to the self-hosted stack via
`supabase/selfhost/deploy-functions.sh` (smoke test: *All 17 functions responding*).

### A bug the deploy log caught

The first deploy exposed a flaw in the `alibaba-1688-item-get` fix itself. The runtime log
showed:

```text
wall clock duration warning: isolate: ...
early termination has been triggered: isolate: ...
```

This runtime **terminates isolates shortly after the response is sent**. The original fix
put the `product_cache` write *behind* up to 8s of background enrichment fetches, so the
write was being killed before it ran — a repeat `item-get` came back `cached=false` at
526ms instead of ~60ms, meaning every product view stayed a cache miss. `seller-products`
was unaffected because its background task is a single fast DB write.

Fixed by writing the usable fast-path row **first**, then upgrading it if enrichment
survives. A killed isolate now still leaves a valid cache entry. Verified on three
never-before-viewed products:

| Product | Cold | Warm | Warm again |
|---|---|---|---|
| ceramic plant pot | 1,486ms | **73ms** `cached=true` | 90ms |
| stainless steel straw | 4,352ms | **73ms** `cached=true` | 86ms |
| wool beanie hat | 1,429ms | **69ms** `cached=true` | 61ms |

### End-to-end, against the competitors

Fresh keywords, so every product click is a genuine cold miss — the realistic worst case
for a customer. Measuring **total click → price visible** (`navMs + firstPrice`), which is
the fair comparison: the competitors' client-side route change is not free, and reporting
only their post-navigation paint understated them in Parts 1–3.

| Keyword | tradeon | chinaonlinebd | skybuybd |
|---|---|---|---|
| cotton hoodie | **1,864ms** | 1,679ms | 426ms |
| ceramic vase | **1,243ms** | 1,233ms | 860ms |

Against the pre-fix figures for the same journey (4,981–11,202ms), cold product clicks now
land at **1.2–1.9s** — roughly level with chinaonlinebd, still behind skybuybd. Any product
viewed by anyone in the previous 12h serves from cache at ~70ms.

Search was unchanged by this work and remains competitive (tradeon 1.9s, chinaonlinebd
1.9s, skybuybd 2.2–3.4s to a stable grid).

### Honest caveat: the enrichment pass still usually doesn't finish

`seller_info.product_count` stays `0` on cached rows, which means the background enrichment
is still being killed by the same early-termination behaviour — only the base write
reliably lands. The consequences are cosmetic and were designed for: description images
fall back to the main product gallery (7–28 images, verified present), and the "N products
from this shop" figure reads 0. The page is complete and correct otherwise.

Closing that gap properly needs the enrichment moved out of the request isolate entirely —
a queue or a cron pass over `product_cache` rows lacking enrichment — rather than relying
on `waitUntil` in a runtime that doesn't honour it for long tasks. Worth doing alongside
the pre-synced catalog work, not before it.

## Part 7 — The product catalog

The 12h `product_cache` meant a product went cold a day after anyone looked at it, so the
gains in Part 6 decayed constantly. `products`
([migration](supabase/migrations/20260918150000_products_catalog.sql)) replaces it with a
catalogue that accumulates, in two tiers: listing fields for every search result (free —
the response already carries them, ~482 B/row) and full detail when someone opens a product
(~9.8 KB/row). Keeping detail only for opened products is what makes it affordable; 100k
products stored thin is ~48 MB, stored full it would be ~1 GB.

Freshness is tracked **per concern** rather than as a single TTL, on the reasoning that a
product's description, specs and variant structure are effectively static while its price is
not. `price_checked_at` is separate from `detail_fetched_at`, so a stale price can be
re-verified on its own instead of re-fetching the whole record.

Verified after deploying the read path:

| Case | Result |
|---|---|
| Catalogued product | 333ms → **63ms**, `source: "catalog"` |
| Listing-only product | 4,384ms live fetch → **157ms** on next open |
| Re-searching a catalogued product | `detail`, `detail_fetched_at`, `first_seen_at` all preserved |

That last row was the one worth proving: a naive upsert would have reset every enriched
product to a bare listing row the next time it appeared in someone's search.

End to end, catalogued vs genuinely fresh (local build against the deployed backend):

| Query | Catalogued | Hero visible | Fully interactive |
|---|---|---|---|
| shoes | yes | 192ms | **282ms** |
| jewelry | yes | 177ms | **330ms** |
| antique brass compass | no | 174ms | 2,917ms |
| velvet cushion cover | no | 175ms | 1,968ms |

The hero paints in ~180ms either way (that is the frontend change, independent of the
catalogue); the catalogue is what moves *fully interactive* from ~2–3s to ~300ms.

### Seeding, and a mistake worth recording

A test environment has no traffic to fill the catalogue with, so
[seed-catalog.mjs](supabase/selfhost/seed-catalog.mjs) does it on demand. The first detail
pass ordered by `view_count` — which is useless on a cold catalogue, because every row is 0
and Postgres returns an arbitrary slice. Measured afterwards: **0 of the top 20 results had
detail** for shoes, bag, jewelry or watches. Re-seeding in search-rank order instead reached
**99% page-1 coverage** (237/240 across 12 category queries). Catalogue now stands at 1,097
products, 555 with detail.

### Price refresh cron

`refresh-product-prices`, hourly at :30. Self-limiting rather than fixed-cost: it selects
only products whose price is actually stale and makes no TMAPI calls when there are none.

TMAPI has no price-only endpoint, so a refresh is still one `item_detail` call per product —
the saving is skipping enrichment and not doing it on a request a customer is waiting for.
The merge carries `desc`, `desc_img` and `seller_info.product_count` over from the stored
row. Verified by backdating `price_checked_at` 30 days on three products:

```
checked:3 updated:2 priceChanged:0 failed:1
  desc 3768/2741/2527 chars   PRESERVED
  desc_img 15/5/9             PRESERVED
  shop_count 0/2039/443       PRESERVED
```

The preserved `shop_count` values are the point: without the merge every refresh would reset
them to 0 and discard enrichment that cost a separate upstream call. The one failure was
transient — both products fetched fine from TMAPI directly and two isolated retries
succeeded — and the design handled it correctly by leaving `price_checked_at` untouched, so
the product stayed in the stale set for the next run.

## Part 8 — Image search

Uploaded-image search returned zero results for every upload. Two independent faults, both
predating this work:

1. **The `temp-images` bucket did not exist** on the self-hosted stack — `[]`, no buckets at
   all — so uploads failed with `Bucket not found`.
   [02_functions_rls.sql](supabase/selfhost/02_functions_rls.sql) creates it, so it was
   either never applied or lost in a restore.
2. **TMAPI was handed an unreachable URL.** `getPublicUrl()` builds from `SUPABASE_URL`,
   which inside the container is `http://supabase-kong:8000`. TMAPI fetches the image over
   the public internet to convert it, so the hostname did not resolve, `convert_url` returned
   its input unchanged, and the search fell through to empty.

Only the upload path touches storage, which is why searching by an existing alicdn URL,
pagination and the OTAPI fallback all worked and the feature looked partly functional.

### What `convert_url` actually does

It **ingests the image into Alibaba's visual-search index** and returns an internal token —
not a URL rewrite. Evidence: the same image converted three times produced three different
tokens; the token 404s on every alicdn host; and v2 rejects a raw URL with
`422 "Invalid image url. Please first use the convert endpoint"`. That is why it costs
1.7–13.3s: Alibaba must download, decode and feature-extract the image.

Timing for the full chain (upload → convert → search, a strict dependency, nothing
parallelisable):

| Stage | Time |
|---|---|
| Storage upload | ~600ms |
| `convert_url` | **1.7–13.3s** |
| v2 search | ~1.8–2.8s |

**A hypothesis of mine that the measurements refuted:** shrinking the uploaded image. Three
runs each at 640×640 q0.72 (current, 35 KB) and 400×400 q0.5 (10 KB) gave convert times of
1988/5642/1778ms versus 2190/1755/6328ms — completely overlapping, because the endpoint's
variance on *identical* input is far larger than any size effect in this range. The smaller
image also cost relevance: only 15–16 of the top 20 results still matched. Current settings
stay.

The real lever is that **converted tokens remain valid** — tokens created 70 minutes earlier
still returned 20 results — so caching `image hash → token` would skip ingestion entirely on
a repeat search. Not built.

## Part 9 — Translation

The previous developer described two layers of translation. There is one, and it is TMAPI's.

Verified directly — the same `item_detail` call, with and without the parameter:

```
WITH language=en : "Household Cutting Board Wholesale Kitchen Cutting Board Bamboo..."
WITHOUT          : "家用菜板批发厨房切菜板竹制水果菜板熟食分类砧板方形竹木案板"
props WITH en    : [{"Material":"Bamboo"},{"Brand":"Purple bamboo forest"}]
props WITHOUT    : [{"材质":"竹制"},{"功能":"家用;防滑"}]
```

An earlier client-side layer was removed but left scaffolding behind, all of it inert and now
deleted: `_translatedTitles` and `_isTranslatingTitles` (no setters, permanently empty),
`isTranslatingProduct` (permanently `false`, ORed into a loading prop), and `getDisplayTitle`,
reduced to returning `product.title` unchanged.

One real translation remained: `translateLocation`, which collapses Chinese origins to
"China" but tested only for 省 and 市 — missing every county-level origin. Measured across
997 catalogued products, 60 (6%) reached the page still in Chinese (福建 德化县, 浙江 桐庐县,
安徽 潜山县 …, all 县). Matching any CJK character closes it: verified **60 → 0** over the
same sample, with latin origins still passed through.

`translated: true` is still hardcoded at eight call sites and the `search_cache.translated`
column is therefore always true. It is inert metadata nothing reads — left alone rather than
redeploying several functions for no behavioural gain.

## Still open

- **Frontend commits are not deployed.** `f036903` (instant hero), `3e6e138` (location fix,
  dead code) and `3953d92` run only locally; `trade.botbhai.net` serves the old build.
  Everything backend is live.
- **PayStation credentials are not set** on the self-hosted stack —
  `PAYSTATION_MERCHANT_ID` and `PAYSTATION_PASSWORD` are absent, so checkout returns
  `"PayStation credentials not configured"`. Harmless on staging (arguably a safety feature),
  a hard blocker for the production cutover.
- `maxAgeDays: 0` fix for `refresh-product-prices` (`725d408`) is committed but not deployed.
  It only affects the manual override, not the hourly cron.
- Image-search token caching (`image hash → converted token`) and prefetching
  upload+convert during the crop dialog — both scoped, neither built.
- Production `tradeon.global` still runs the Lovable-managed backend and has received none
  of this.

## Raw data

Screenshots, JSON results, and network waterfalls for every run are in the local scratchpad
at `pw-bench/` (not committed to the repo):
`results.json`, `results2.json`, `results4.json`, `results5.json`, `waterfall.json`,
`detail-waterfall.json`, `detail-multi-results.json`, `edge-bench-results.json`, plus
per-run PNG screenshots named `<site>-<keyword>-search.png` / `-detail.png`.
