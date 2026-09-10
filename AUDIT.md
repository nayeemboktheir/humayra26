# TradeOn — End-to-End Codebase Audit

**Repository:** `D:\Coding\tradeon` · **Branch:** `optimization` @ `5798c44` · **Date:** 2026-09-11
**Site:** tradeon.global — live storefront (771 orders, 597 users per `LOVABLE-MIGRATION-PLAN.md`)

---

## How to read this document

Every finding carries a **verification status**, because not all of them were confirmed to the same depth:

| Tag | Meaning |
|---|---|
| **[VERIFIED]** | I read the exact code/ran the exact command myself and reproduced the result. |
| **[REPORTED]** | Found by an analysis pass over the file; the code was read but the exploit was not executed. |
| **[NEEDS-LIVE-CHECK]** | Depends on the state of the live Supabase project, which this repo cannot show. Must be confirmed against `pg_policies` / the running DB before being trusted either way. |

**Nothing in this audit was exploited against the live site.** Payment, OTP, and email findings are derived from reading source, not from probing production.

### Scope

Audited: all 22 Supabase edge functions + `_shared/`, all 37 SQL migrations, `src/` (143 TS/TSX files), `cache-api/`, `server.cjs`, Docker/Compose/Caddy/`.htaccess`, the CI pipeline, and build configuration.

### Codebase state note

This audit was performed across commits `ba91929` → `5798c44` (a merge of `main` into `optimization`, plus OT Commerce branding removal). The merge touched only `Footer.tsx`, `ProductDetail.tsx`, `ShippingRatesModal.tsx` and deleted an asset. **All findings below were re-verified against `5798c44`** — `package.json`, both lockfiles, `supabase/`, `src/lib/`, `src/contexts/` and `Cart.tsx` are unchanged by it.

---

## Executive summary

The application is functional and shows real engineering care in places — the caching strategy, the role-resolution cache, `AdminDataTable`'s request sequencing, and `PaymentCallback`'s refusal to trust a URL parameter are all well built, and several files carry genuinely good explanatory comments.

That care is not evenly distributed. The audit found **five issues that are exploitable by an anonymous internet user against a live store handling real money**, and one that **currently breaks the staging build**.

The single structural problem, from which several criticals descend: **the browser is trusted to compute money.** Order prices, totals and the amount charged to the payment gateway are all calculated client-side and written directly to the database, with RLS policies that verify *who* is writing but never *what* value they write. There is no server-side authority for what a product costs.

### P0 — fix before anything else

| # | Finding | Impact | Status |
|---|---|---|---|
| [1.1](#11-client-controlled-pricing-end-to-end) | Client sets its own order price; gateway charges it | Buy any product for ৳1 | **[VERIFIED]** code path |
| [2.1](#21-get_user_emails-leaks-every-users-email-to-anonymous-callers) | `get_user_emails()` returns all 597 emails to anon | Full customer PII dump | **[VERIFIED]** |
| [3.1](#31-otp-brute-force--account-takeover) | OTP brute-forceable → magic link for any account | Account takeover | **[VERIFIED]** |
| [3.4](#34-auth-email-hook-is-an-unauthenticated-branded-email-relay) | `auth-email-hook` is an open branded email relay | Phishing from `@tradeon.global` | **[REPORTED]** |
| [7.1](#71-the-staging-build-is-broken-right-now) | Stale lockfile → staging Docker build fails | Cannot deploy staging | **[VERIFIED]** |
| [8.2](#82-cache-api-is-an-open-billed-api) | `cache-api` `/api/*` is unauthenticated and unthrottled | Open meter on a paid API | **[VERIFIED]** |

One more **live production bug** sits just below P0 and is cheap to fix: [§8.1](#81-search-result-images-are-broken-in-production--a-live-drift-bug) — search-result product images are served unfixed in production because the search edge function has a stripped-down copy of a normalizer its two siblings have in full.

---

## 1. Payment & pricing integrity

### 1.1 Client-controlled pricing, end to end
**Severity: CRITICAL · [VERIFIED] (code path read in full; not exploited)**

Three layers each independently fail to establish what a product actually costs.

**Layer 1 — the order row is written by the browser.** `src/pages/dashboard/Cart.tsx:101-120`:

```ts
const { error } = await supabase.from("orders").insert({
  user_id: user.id,
  unit_price: item.unit_price,        // from cart_items, client-writable
  total_price: itemTotal,             // computed in the browser
  payment_amount: opts.paymentOption === "partial" ? Math.round((...) * 0.7) : ...,
  payment_invoice: invoiceNumber,
} as any);
```

The governing RLS policy (`supabase/migrations/20260210115713_...sql:50`) is:

```sql
CREATE POLICY "Users can insert own orders" ON public.orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);
```

It constrains ownership only. No trigger, RPC or constraint re-derives price from an authoritative source.

**Layer 2 — the cart price is equally writable.** `cart_items.unit_price` is `NUMERIC NOT NULL DEFAULT 0` (`20260406180949_...sql:12`) and `"Users can update own cart"` (`:25`) has **no `WITH CHECK`** — a user can `PATCH` their own cart row to `unit_price: 0.01` with nothing but their session token.

**Layer 3 — the gateway is told to charge the client's number.** `supabase/functions/paystation-init-payment/index.ts:56` forwards it verbatim, with `verify_jwt = false` and no auth check in the body:

```ts
formData.append('payment_amount', String(payment_amount));
```

**Layer 4 — verification compares two attacker-controlled numbers.** `paystation-verify-payment/index.ts:80-86` decides paid-vs-partial by comparing `sum(payment_amount)` against `sum(total_price + domestic_courier_charge + commission)` — both set by the same client at insert time. The amount PayStation *actually collected* (`data.data.payment_amount`) is returned to the client at `:159` but **never compared to anything**.

**Failure scenario.** A logged-in customer sets `total_price: 1, payment_amount: 1` on their own order, completes a genuine ৳1 bKash payment, and `verify-payment` sees `sumPayable ≈ sumGrand`, writes `payment_status: 'paid'`, inserts a matching `transactions` row, and emails an invoice. Staff see a fully paid order and ship goods worth thousands of BDT.

**Fix.** Order creation must move server-side. One `SECURITY DEFINER` RPC (or edge function) that re-fetches the authoritative price for each `product_id`, computes `total_price`/`payment_amount` itself, and is the **only** writer of those columns. Revoke direct client INSERT on `orders`. `paystation-init-payment` should look the amount up from the invoice, never accept it in the request body.

### 1.2 Payment verification is replayable
**Severity: CRITICAL · [VERIFIED]**

`paystation-verify-payment` is unauthenticated, takes an arbitrary `invoice_number`, and has no idempotency guard. Every call where PayStation reports success:

- **inserts a new `transactions` row** (`:104`) with no check for an existing `reference_id = trxId` → duplicate revenue in any report summing that table;
- **inserts a duplicate notification** (`:112`);
- **unconditionally sets `status: 'pending'`** (`:94`) with no guard on the current value → an order already marked *Shipped* or *Delivered* in the admin dashboard is silently reverted to pending on any replay, including a customer simply refreshing the callback page.

There is also no ownership check: anyone who knows an `invoice_number` can trigger this against someone else's order and receives that order's `trx_id`, `payment_amount` and `payment_method` in the response (`:153-161`) — an IDOR information disclosure.

**Fix.** Guard the insert on `reference_id` not already existing; never downgrade a fulfilment status (`.eq('payment_status','pending')` on the update); require the caller's JWT to match `orders.user_id`.

### 1.3 Non-atomic checkout leaves orphaned orders
**Severity: HIGH · [REPORTED]** — `src/pages/dashboard/Cart.tsx:91-123`

Cart items are inserted one at a time in an awaited loop. If payment initiation then fails, the function `return`s — **the already-inserted `orders` rows are never rolled back**, and the cart is only cleared on success. The next attempt generates a fresh `order_number` from `Date.now()` and creates a *second* full set of orders for the same items, with no idempotency key linking them.

**Fix.** Batch-insert line items in one call; on payment-init failure either void the created orders or reuse them on retry via the shared `payment_invoice`.

### 1.4 No `UNIQUE` on `orders.order_number`
**Severity: MEDIUM · [VERIFIED]** — `20260210115713_...sql:36`

`order_number TEXT NOT NULL` with no unique constraint, generated client-side as `` `HT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,5)}` `` (`Cart.tsx:92`). A grep of every `UNIQUE` in the migration history confirms none covers this column. Collision is unlikely but nothing prevents a double-submit from producing two orders sharing a customer-facing invoice number.

### 1.5 Money columns have no constraints and inconsistent types
**Severity: MEDIUM · [VERIFIED]**

No money column anywhere in the schema has a `CHECK (... >= 0)`. Typing is also split: `unit_price`/`total_price`/`wallets.balance`/`transactions.amount` are `DECIMAL(12,2)`, while `shipping_charges` and `commission` (`20260211191127_...sql:3-4`), `domestic_courier_charge` (`20260227213413_...sql:3`) and `payment_amount` (`20260312190439_...sql:6`) are unbounded `numeric`.

Good news: a grep for float money columns found **none** — everything is exact `numeric`, so there is no floating-point currency bug.

> **Citation note:** an earlier analysis pass mis-attributed three of these columns by one file. The filenames above were re-checked directly against the migration contents and are correct.

### 1.6 No index on `orders.payment_invoice`
**Severity: MEDIUM · [VERIFIED]** — the payment callback does `.eq('payment_invoice', ...)` on both a SELECT and an UPDATE (`paystation-verify-payment/index.ts:74-96`) on every payment. No index on that column exists in any migration — not even in the unapplied `hot_path_indexes` batch.

```sql
CREATE INDEX IF NOT EXISTS idx_orders_payment_invoice ON public.orders (payment_invoice);
```

---

## 2. Data exposure

### 2.1 `get_user_emails()` leaks every user's email to anonymous callers
**Severity: CRITICAL · [VERIFIED]** — `supabase/migrations/20260228124744_...sql:2-9`

```sql
CREATE OR REPLACE FUNCTION public.get_user_emails()
RETURNS TABLE(user_id uuid, email text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id as user_id, email::text FROM auth.users;
$$;
```

No role check in the body. I grepped **every** `GRANT`/`REVOKE` in the entire migration history: the only `REVOKE` is for `get_my_role()`. Postgres grants `EXECUTE` to `PUBLIC` by default and PostgREST exposes public-schema functions as RPC to `anon`, so this is callable with nothing but the publishable key that ships in the JS bundle.

The frontend only calls it from admin pages (`AdminCustomers.tsx:75`, `AdminRoles.tsx:26`) — but that is a UI convention, not access control.

**Fix:**
```sql
CREATE OR REPLACE FUNCTION public.get_user_emails()
RETURNS TABLE(user_id uuid, email text)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT id, email::text FROM auth.users
  WHERE public.has_role(auth.uid(), 'admin'::app_role);
$$;
REVOKE ALL ON FUNCTION public.get_user_emails() FROM public;
GRANT EXECUTE ON FUNCTION public.get_user_emails() TO authenticated;
```

### 2.2 `has_role()` is a public role-probe oracle
**Severity: MEDIUM-HIGH · [VERIFIED]** — `20260211084027_...sql:16-27`

`search_path` is correctly pinned, but like `get_user_emails` it has no `REVOKE`, so `anon` can call it via RPC with an arbitrary `_user_id` to enumerate who holds `admin`/`moderator`/`employee`. It is an internal RLS predicate that was never meant to be an endpoint. Revoking `EXECUTE` from `public` does **not** affect its use inside policies.

### 2.3 API keys live in a table with a blocklist policy
**Severity: MEDIUM (was CRITICAL) · [REPORTED] / [NEEDS-LIVE-CHECK]**

`app_settings` stores `bulksms_bd_api_key` and `meta_capi_token` as plaintext rows. It was created with `CREATE POLICY "Anyone can read settings" ... USING (true)` (`20260213195523_...sql:31`) — **world-readable live credentials** — and remediated on 2026-07-08 (`20260708120710_...sql`) with a policy excluding four specific keys.

Two problems remain. It's a **blocklist**, so any future sensitive key added is world-readable by default. And `GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated` (`:2`) hands every logged-in user table-level write, with only RLS standing behind it.

**Given the historical exposure window, `bulksms_bd_api_key` and `meta_capi_token` should be rotated regardless of the current policy.** Long term these belong in edge-function secrets, not a settings table.

### 2.4 `admin_messages` UPDATE allows staff impersonation
**Severity: MEDIUM · [REPORTED]** — `20260213195523_...sql:17`

`FOR UPDATE USING (auth.uid() = user_id)` with no `WITH CHECK`, never narrowed by a later migration. Postgres reuses `USING` as the check, so ownership is enforced but **every other column is free** — a user can rewrite `message`, `subject`, and set `sender_role = 'admin'` / `sent_by = <any uuid>` on their own support thread, fabricating messages that appear to come from staff. Usable for chargeback/dispute evidence.

**Fix:** restrict the policy to `is_read` only, or use column-level grants.

### 2.5 Lower-severity exposure
- **`role_permissions` readable by any authenticated user** (`20260415142505_...sql:18`, `USING (true)`) — leaks the admin permission matrix. Reconnaissance value, no secrets. **LOW**
- **`notifications` UPDATE has no column restriction** — a user can rewrite the text of their own notifications. **LOW**
- **`.env` is committed to git** — `git ls-files` confirms it. Contents are only `VITE_*` publishable values that ship in the bundle anyway, so direct exposure is limited, but the pattern guarantees the next secret added leaks. `.gitignore` covers `staging.env` and `cache-api/.env` but not the root `.env`. **MEDIUM** · **[VERIFIED]**

---

## 3. Authentication

### 3.1 OTP brute-force → account takeover
**Severity: CRITICAL · [VERIFIED]** — `supabase/functions/verify-sms-otp/index.ts`

Chain of four independent weaknesses:

1. **No attempt cap.** The lookup at `:39-49` matches `(phone, otp_code)` with no counter, no lockout, no per-IP throttle, and failures don't invalidate the code. 6 digits, 10-minute window, `verify_jwt = false`, CORS `*`.
2. **The OTP isn't cryptographically random.** `send-sms-otp/index.ts:55` uses `Math.floor(100000 + Math.random() * 900000)` — `Math.random()` is not a CSPRNG, and this value gates authentication.
3. **A correct guess mints a session.** On match, the service role calls `auth.admin.generateLink({type:'magiclink'})` and returns `token_hash` + the account's email directly in the response (`:75-96`).
4. **The client only rate-limits the resend button** (`src/pages/Auth.tsx:192-212`), not verification.

Anyone who knows a customer's phone number can take over that account.

**Fix.** Per-phone attempt counter (lock + invalidate after ~5 failures), per-IP rate limiting, and `crypto.getRandomValues` for generation.

### 3.2 Unlimited unauthenticated SMS sending
**Severity: CRITICAL · [VERIFIED]** — `send-sms-otp` has no rate limiting of any kind. Each call inserts a row and fires a real, billed SMS. A loop is both an SMS-bombing tool aimed at any Bangladeshi number and a direct charge on the BulkSMS account.

`send-shipment-sms` is worse in one respect: it takes an attacker-supplied `userId`, looks up that user's phone and texts them (`:38-72`), and its `skipped` response doubles as a "does this user ID have a phone" oracle.

### 3.3 SMS credentials and live OTPs sent over plaintext HTTP
**Severity: HIGH · [VERIFIED]** — `send-sms-otp/index.ts:79`, `send-shipment-sms/index.ts:99`, `admin-send-sms/index.ts:138`:

```ts
const smsUrl = `http://bulksmsbd.net/api/smsapi?api_key=${BULKSMS_API_KEY}&...&message=${encodeURIComponent(message)}`;
```

`http://`, with the API key **and the live OTP** in the query string. Any intermediary can read both. This directly undercuts §3.1. The same pattern applies to TMAPI: `http://api.tmapi.top/1688` with `apiToken` in the query string across nine files.

**Both the BulkSMS key and the TMAPI token should be rotated**, and switched to HTTPS with the key in a header.

### 3.4 `auth-email-hook` is an unauthenticated branded email relay
**Severity: CRITICAL · [REPORTED]** — `supabase/functions/auth-email-hook/index.ts:125-193`

`config.toml` sets `verify_jwt = false` and `handleWebhook` verifies nothing before rendering a template and calling Resend. A POST with `{"action_type":"recovery","email":"victim@anywhere.com","url":"https://evil.example/phish","token":"000000"}` sends a fully-branded email from `TradeOn Global <noreply@tradeon.global>` with an attacker-chosen link, to any recipient, on the company's Resend account and sending reputation.

Notably `handlePreview` in the *same file* (`:78-86`) **does** check a bearer secret, and the CORS headers advertise `x-lovable-signature` / `x-lovable-timestamp` that are never read — so this reads as an oversight, not a decision.

**Fix.** Verify the Supabase auth-hook HMAC (`SEND_EMAIL_HOOK_SECRET`), or at minimum apply the same bearer check already written for `/preview`.

### 3.5 `profiles.phone` is unverified, non-unique, and used as a login key
**Severity: HIGH · [VERIFIED]** (no `UNIQUE` confirmed by grep) **/ [NEEDS-LIVE-CHECK]** (exploitability depends on signup flow)

`profiles.phone` is plain `TEXT` (`20260210115713_...sql:7`), populated from unverified signup metadata by `handle_new_user()`. `verify-sms-otp:66-70` then treats it as the identity key: after a valid OTP it finds the profile `.eq("phone", normalizedPhone)` and mints a magic link for **that** account.

If an attacker registers with a victim's phone number in their signup metadata, the victim's later legitimate OTP login can resolve to the attacker's profile. If two profiles ever share a phone, `.maybeSingle()` throws and OTP login breaks for both.

**Fix:** `ALTER TABLE public.profiles ADD CONSTRAINT profiles_phone_unique UNIQUE (phone);` and only ever write `profiles.phone` from a `verified = true` row in `phone_otps`.

---

## 4. Authorization

### 4.1 `verify_jwt = true` is not authentication
**Severity: HIGH (systemic) · [VERIFIED]** — `supabase/config.toml`

Worth stating plainly because the config reads as if it protects things: in Supabase, `verify_jwt = true` is satisfied by **any** valid JWT, and the publishable anon key is a valid JWT that ships in the public bundle. It is not a login check.

Only two of 22 functions do real authorization — `admin-send-sms:31-60` and `send-invoice-email:255-274`, both correctly resolving the bearer token to a user and checking `has_role`. **These two are the pattern every other privileged function should follow.**

Functions with real-world side effects and *no* effective auth: `auth-email-hook`, `paystation-init-payment`, `paystation-verify-payment`, `send-shipment-sms`, `send-sms-otp`, `verify-sms-otp`, `tmapi-probe`, `refresh-category-products`, `refresh-trending-products`, and all `alibaba-1688-*` / `firecrawl-*` / `tmapi-*` proxies.

### 4.2 Staff routes are gated on `isStaff`, ignoring `role_permissions`
**Severity: MEDIUM · [REPORTED]** — `src/App.tsx:114-125`

`AdminRoute` checks only `isStaff` (admin **or** moderator **or** employee). The per-page `role_permissions` matrix is applied solely to filter the sidebar (`AdminLayout.tsx:49`). Any moderator or employee can type `/admin/wallets` or `/admin/permissions` and the page renders.

Today the underlying tables mostly fail closed — `wallets`/`transactions` RLS requires literal `admin` — so this is contained *by accident*, not design. Any new admin page, or any table scoped to "staff" rather than "admin", is immediately exposed.

**Fix:** have `AdminRoute` consult `hasAccess(pageKey)` in addition to `isStaff`.

### 4.3 Confirmed sound
For calibration — these were checked and are correct: **no self-INSERT policy on `user_roles`** anywhere in the migration history (no privilege escalation by self-granting), **no user UPDATE policy on `orders`** (users cannot flip their own `payment_status`), **no user UPDATE on `wallets.balance`**, **no user INSERT on `transactions`** (no self-crediting), and `phone_otps` is service-role-only. `clearRoleCache()` is correctly called on sign-out (`AuthContext.tsx:30-32`).

---

## 5. Third-party cost abuse

All unauthenticated, all billed per call. **[REPORTED]**

| Function | Issue | Severity |
|---|---|---|
| `tmapi-probe` | Its own line 1 says *"temporary debug"*. Live in production, no auth, fires **14 upstream TMAPI calls per request**, and is the only function in the repo with no top-level try/catch. **Delete it.** | **CRITICAL** |
| `firecrawl-map/scrape/search` | Arbitrary URL/query, no auth, no rate limit, `options.limit` defaults to 5000 with no ceiling — a free crawler on the company's Firecrawl budget | **HIGH** |
| `alibaba-1688-*`, `tmapi-keyword-search` | No throttling; varying the query string defeats the cache entirely. `seller-products`, `shipping-fee` and `tmapi-keyword-search` have **no cache at all** | **HIGH** |
| `refresh-category-products` | Uncapped caller-supplied `categories[]` → up to N sequential upstream calls per request | **HIGH** |
| `refresh-trending-products` | 24h cost throttle is bypassed by appending `?force=1`, unauthenticated | **HIGH** |
| `alibaba-1688-image-search:280-305` | Unauthenticated arbitrary upload to a **public** bucket, no size cap, content-type guessed from 2 magic-byte prefixes; cleanup is a 15-minute `setTimeout` in an isolate that is recycled after the response — so it effectively never runs | **HIGH** |

`refresh-category-products:96-97` and `refresh-trending-products:81-82` both **delete before inserting, non-atomically** — a failed insert leaves the category (or the entire trending section) empty, while still returning `success: true`.

---

## 6. Application correctness

### 6.1 react-query is installed, mounted, and never used
**Severity: HIGH (systemic) · [REPORTED]** — `QueryClientProvider` is wired in `App.tsx:67,134`, but `useQuery`/`useMutation`/`useInfiniteQuery` appear in **zero files**. Every fetch in the app is a hand-rolled `useState` + `useEffect`, and `AbortController` appears **nowhere in `src/`**. The app ships the library's cost and gets none of its caching, dedup, retry or cancellation — which is the root cause of the race conditions below.

### 6.2 Stale responses overwrite fresh ones
**Severity: HIGH · [REPORTED]** — `Index.tsx:338-370, 605-680, 822-868`, `ProductSearch.tsx:70-97`, `SellerStore.tsx:49-90`

No sequencing or cancellation on search, pagination or product-click fetches. Click product A then quickly product B: if A resolves last, the user is looking at **product B's page showing product A's data** — and adds A to their cart believing it's B.

`AdminDataTable.tsx` solves exactly this correctly with a `reqIdRef` sequence guard — that pattern should be lifted.

### 6.3 `ProductDetail` never resets state between products
**Severity: HIGH · [REPORTED]** — `ProductDetail.tsx:60-83`

The component isn't unmounted between products; `Index.tsx` swaps the `product` prop. Nothing resets `quantity`, `skuQuantities`, `selectedSkuId`, `selectedImage` or `variantOverrideImage` on `product?.num_iid` change. Set quantity 5 on product A, open product B → **B is ordered at quantity 5**. `selectedImage` can also index out of bounds.

Related, `:217-223`: `isWishlisted` is only ever set to `true`, never back to `false`, so the heart stays filled on the next product and clicking it fires a `delete` instead of an `insert`.

### 6.4 Rating and category filters do nothing
**Severity: HIGH (broken feature) · [REPORTED]** — `SearchFilters.tsx:265-298`

`applyFilters` reads `priceRange` and `sortBy` but **never reads `minRating` or `selectedCategories`**. The UI shows the checkbox as selected and the result list is unchanged.

### 6.5 Admin pages download entire tables
**Severity: MEDIUM-HIGH · [REPORTED]**

- `AdminOrders.tsx:107-127` — unpaginated `select("*")` on `orders`, `profiles` and `shipments` plus `get_user_emails()`, filtered client-side. Degrades linearly with order volume, on every admin visit.
- `AdminAnalytics.tsx:12-19` — every order ever placed, pulled to the browser to compute aggregates; the `error` is destructured away, so a failure renders a dashboard of zeros.
- `AdminMessaging.tsx:61-83` — a realtime subscription on `event: "*"` refetches **all** messages + profiles + orders on every row change. Its own broadcast feature inserts one row per recipient, so "send to all users" triggers hundreds of full-table refetches.

### 6.6 Other correctness issues
- **`Cart.tsx:23-30`** — `prev.length === 0` is used to mean "nothing selected yet", but it's indistinguishable from "user deselected everything", so any quantity change silently re-selects all items. **MEDIUM**
- **Buy Now has no in-flight guard** (`ProductDetail.tsx:1063`) while Add to Cart does. **MEDIUM**
- **`sendReply` has no re-entrancy guard** (`AdminMessaging.tsx:137`) — only the button is disabled, so two fast Enters send twice. **MEDIUM**
- **Mark-as-read depends on `[active?.key]`** so messages arriving in an open thread are never marked read — permanently stuck unread badges. **MEDIUM**
- **`SellerStore.tsx:74-76`** — `catch {}` makes a backend outage indistinguishable from an empty store. **MEDIUM**
- **One app-wide ErrorBoundary** (`main.tsx:79`) — a crash anywhere blanks the entire SPA. **MEDIUM**
- **Currency race** — `getCnyToBdtRate()` falls back to `19` and markup to `15` before settings load. The fallbacks match today's DB values so nothing is visibly wrong *now*, but if an admin changes the rate, a fast click prices at the stale rate. Nothing gates checkout on settings having loaded. **MEDIUM**
- **XSS** — no `dangerouslySetInnerHTML` on user or remote content anywhere; 1688 descriptions render as `<img>` URLs, not markup. The one gap is `TrackingScripts.tsx:39-105`, which interpolates admin-set pixel IDs into `script.innerHTML` — admin-only, so stored self-XSS with no privilege gain. **LOW**

---

## 7. Build, dependencies, and CI

### 7.1 The staging build is broken right now
**Severity: CRITICAL · [VERIFIED] — reproduced twice**

`bun.lock` pins `rollup@4.24.0` and was last committed 2026-08-24. `package.json` changed 2026-09-07 to add `vite-imagetools`, which appears in **neither** lockfile (`grep -c imagetools` → 0 in both).

```
$ bun install --frozen-lockfile --dry-run
error: lockfile had changes, but lockfile is frozen
```

`Dockerfile:14` runs exactly `bun install --frozen-lockfile`, so **the staging Docker build fails outright.**

CI (`deploy.yml:23`) runs plain `bun install`, which re-resolves the graph. That re-resolution currently produces two Rollup versions — hoisted `4.24.0` alongside `vite/node_modules/rollup@4.62.5` (vite 5.4.19 depends on `rollup: ^4.20.0`, which floats). Rollup 4.62.x rejects vite's own polyfill import:

```
$ bun run build
error during build:
Source phase import "vite/modulepreload-polyfill" in "index.html" must be external.
```

**Production is not currently broken.** `main` is at `c0400d7` and does not contain the `vite-imagetools` commit — the breakage is confined to `optimization` and reaches production the moment this branch merges.

**Fix:** regenerate `bun.lock` (plain `bun install`), delete `node_modules`, clean install, confirm `bun run build` passes, and commit the lockfile **before merging**. Pin rollup if the float recurs. Change CI to `bun install --frozen-lockfile` so drift fails CI instead of reaching Docker silently.

### 7.2 CI has no quality gate at all
**Severity: HIGH · [VERIFIED]** — `deploy.yml` runs checkout → setup-bun → `bun install` → `bun run build` → asset check → FTP deploy. There is **no lint, no test, and no typecheck** step. Combined with §7.3, nothing anywhere prevents broken code from shipping.

### 7.3 Nothing type-checks the code
**Severity: HIGH · [VERIFIED]** — `strict: false`, `strictNullChecks: false`, `noImplicitAny: false`, and **no `typecheck` script exists**. `vite build` uses esbuild/SWC, which strips types without checking them. Type errors cannot fail any pipeline because nothing runs `tsc`.

Scale of the untyped surface: 98 `: any` + 56 `as any` in `src/`, and 32 non-null assertions — **26 of them in `ProductDetail.tsx` alone**, including `user!.id` and `user!.email` on the checkout path and 20+ uses of `product.configuredItems!`. A null session at checkout throws an uncaught `TypeError`.

Add `"typecheck": "tsc -b --noEmit"` and gate CI on it.

### 7.4 Lint currently fails
**Severity: HIGH · [REPORTED]** — `bun run lint` exits 1 with **320 problems (295 errors, 25 warnings)**: 277 × `no-explicit-any`, 14 × `react-hooks/exhaustive-deps`, 11 × `react-refresh/only-export-components`, 5 × `no-useless-escape`, 5 × `no-empty`. Since CI never runs lint, this has been failing unnoticed.

Four of the `no-empty` errors are empty `catch {}` blocks in edge functions that call external APIs. `@typescript-eslint/no-unused-vars` is disabled in `eslint.config.js:23` and `noUnusedLocals` is off in both tsconfigs — so **no layer catches dead code**. 8 `console.log` remain in `src/`, 37 in edge functions.

### 7.5 Tests pass but cover almost nothing
**Severity: HIGH · [REPORTED]** — `bun run test` → **28 tests, 4 files, all passing**, against 138 source files (~3%).

Covered: CDN image transforms, the cache-API client, `AdminDataTable` pagination. **Not covered:** the entire payment flow (client and both edge functions), `currency.ts` (the module whose comments define what customers are charged), `AuthContext`, `CartContext`, `roles.ts`, `useAdmin`, `useRolePermissions`. Every module where a silent regression has financial or access-control consequences has zero tests.

### 7.6 Dependencies
**[REPORTED]**

- **`bun audit`: 102 vulnerabilities (2 critical, 54 high).** Actionable, non-breaking bumps: `vitest` 3.2.4 → 3.2.7 (**critical**, GHSA-5xrq-8626-4rwp), `react-router-dom` 6.30.1 → 6.30.6 (**high**, XSS via open redirect — actively used in 16 files), `@supabase/supabase-js` (**high**, `ws` DoS).
- **`@capacitor/*` (4 packages) is dead weight** — zero imports in `src/`, no `android/` or `ios/` directory. It also drags in ~15 HIGH advisories via `@xmldom/xmldom`. **Removing it deletes those 15 findings for free.**
- **Unused:** `zod`, `date-fns`, `@hookform/resolvers` (zero imports), plus five generated shadcn wrappers nothing imports — `resizable`, `drawer`, `command`, `carousel`, `calendar` — and with them `react-resizable-panels`, `vaul`, `cmdk`, `embla-carousel-react`, `react-day-picker`.
- **`next-themes`** has no `ThemeProvider` mounted anywhere, while `tailwind.config.ts:4` declares `darkMode: ["class"]` — dark mode is half-wired.
- **Three lockfiles.** `bun.lock` (canonical, stale), `package-lock.json` (stale since 2026-02-25, missing `vite-imagetools`), and the legacy binary `bun.lockb`. Nothing enforces the package manager — no `packageManager` field, no `only-allow` preinstall — so `npm install` silently builds from the stale npm lock.

### 7.7 Repo hygiene
- `.env` tracked (see §2.5). `dist/` is correctly **not** tracked — verified.
- `docs/` holds ~3 MB of committed artifacts: three ~700 KB self-contained HTML diagrams plus 12 PNG visual-check screenshots (2 resolutions × 2 themes × 3 diagrams) with no CI consumer.
- Two **0-byte migration files** (`20260227213944_...sql`, `20260704131409_...sql`).
- Three **duplicate no-op migrations** (`20260824170121/170226/170231`) that re-apply functions already applied — evidence the deploy pipeline lost track of state.
- `20260527151924_...sql:1` is an unguarded `DELETE FROM` on three tables committed as a permanent migration — it will re-run and wipe those tables on any fresh `db push` replay.
- `20260430074335_...sql` hardcodes a fix for one specific order (`payment_invoice = 'PS-1778133829089'`) — a support ticket living in schema history.

### 7.8 Configuration
- **`index.html` has no CSP** while `TrackingScripts.tsx` injects three third-party scripts at runtime. **HIGH**
- **No JSON-LD, no canonical URL** on a storefront; `og:url` is hardcoded to the homepage in static HTML, so **every shared product link previews as the homepage**. **MEDIUM**
- **`hmr.overlay: false`** (`vite.config.ts:25-27`) hides runtime errors during development — compounding every "nothing catches this" finding above. **MEDIUM**
- **`manualChunks` regexes use `[\/]`** (`vite.config.ts:60,63`), flagged by ESLint. Works today since Rollup ids use forward slashes, but if it ever breaks, `recharts`/`jspdf` silently fall back into the main vendor chunk — defeating the optimization the surrounding comments exist to protect. Worth a build assertion. **MEDIUM**
- **`capacitor.config.ts`** points `server.url` at a `lovableproject.com` preview URL with `cleartext: true`. Harmless while unused; shipping a mobile app with it would point the app at a preview host over plaintext. **MEDIUM**

---

## 8. Infrastructure & deployment

### 8.1 Search-result images are broken in production — a live drift bug
**Severity: HIGH · [VERIFIED] — diffed both files directly**

`cache-api/src/tmapiMap.js` is a hand-maintained copy of mapping logic that also lives in two edge functions; its own header warns there is no shared module. **They have already drifted**, and the drift is shipping.

`supabase/functions/alibaba-1688-item-get/index.ts:38-46` has the full normalizer:

```ts
let cleaned = u.trim().replace(/\\/g, '').replace(/^['"]+|['"]+$/g, '');
cleaned = cleaned.replace(/^https?:\/\/itemcdn\.tmall\.com\/%22(https?:\/\/[^%]+)%22\/?$/i, '$1');
cleaned = cleaned.replace(/^https?:\/\/itemcdn\.tmall\.com\/["']?(https?:\/\/[^"']+?)["']?\/?$/i, '$1');
cleaned = cleaned.replace(/&amp;/g, '&');
```

`supabase/functions/alibaba-1688-cached-search/index.ts:24-28` has only:

```ts
function normalizeImg(u: string): string {
  if (!u) return '';
  if (u.startsWith('//')) return `https:${u}`;
  return u;
}
```

`cache-api/src/tmapiMap.js:37-45` has the **full** version. So the staging path and the product-detail path both handle these URLs; **the production search path does not.** Any search result whose image URL comes back wrapped in the `itemcdn.tmall.com/"<real-url>"` proxy format, or containing an HTML-entity-encoded `&amp;`, is served to users unfixed — a broken product thumbnail on the main search results page, which is the site's primary surface.

**Fix:** copy the full `normalizeImg` into the search function, then extract a shared Deno module both edge functions import — the copy-paste arrangement is what caused this.

### 8.2 `cache-api` is an open, billed API
**Severity: CRITICAL (staging) · [VERIFIED by reading]**

No API key, bearer token, HMAC or IP allowlist anywhere in `cache-api/src/server.js`, and `Caddyfile:14-16` proxies `/api/*` straight through. Keeping the container off published ports protects against *direct* access only — `https://trade.botbhai.net/api/search` is reachable by anyone.

There is no rate limiting, and the cache key is built from raw user input (`server.js:41`). Every distinct `query` is a genuine miss and a real billed TMAPI call. Worse, Redis runs `allkeys-lru` at 256 MB (`docker-compose.yml:50`), so an attacker generating junk queries **evicts legitimate cached results** — recreating the ~1% hit rate this service was built to fix, while running up the bill. `numIid` is likewise unvalidated.

`express.json({ limit: "1mb" })` *is* set (`server.js:6`) but 1 MB is generous for `{query, page, pageSize}`.

**Fix:** shared-secret header checked in middleware, plus `express-rate-limit` keyed by IP, plus a length cap on `query` and a numeric check on `numIid`.

### 8.3 The FTP deploy is non-atomic with no rollback
**Severity: HIGH · [VERIFIED] — step names confirmed**

`deploy.yml` uploads the site to the **live web root twice**: `SamKirkland/FTP-Deploy-Action` ("Deploy to Hostinger FTP root", `:58`) and then a second custom Python `STOR` loop over every file ("Force overwrite Hostinger web root", `:71`). Neither stages to a directory and swaps.

Because `index.html` and its hashed chunks upload as separate files, a visitor mid-deploy can receive a **new `index.html` referencing an asset that hasn't finished uploading** — a 404 on the entry bundle, i.e. a blank page. And if the `STOR` loop fails partway, `set -euo pipefail` fails the job but **the already-overwritten files stay live**, with no snapshot to restore from.

`dangerous-clean-slate: false` (`:68`) also means old assets accumulate on the server forever.

**Fix:** upload assets first and `index.html` last at minimum; ideally deploy to `/releases/<sha>/` and flip the root. Drop the redundant second upload. Keep the previous `dist/` as a CI artifact for rollback.

### 8.4 "Verify live site" can pass on a broken site
**Severity: MEDIUM-HIGH · [REPORTED]** — `deploy.yml:117-139`

The check greps the homepage for the **first** `assets/*.js|css` reference (`head -n 1`) and confirms its `Content-Type`. It does not verify the JS parses, that React mounts, or that **any other chunk exists** — which is exactly the failure mode §8.3 creates. A deploy that leaves a non-first chunk missing reports `✅ tradeon.global is serving index.html and its referenced build asset` while users see a blank page.

### 8.5 `capacitor.config.ts` must never ship as-is
**Severity: CRITICAL if a mobile build is made · [VERIFIED] (config read)**

`server.url` is set to a `lovableproject.com` preview URL. In Capacitor, setting `server.url` makes the native WebView load **that remote URL instead of the bundled `webDir: 'dist'`**. Shipping this would mean: the app is permanently dependent on a disposable preview sandbox (if it's reclaimed, every installed copy goes blank), whoever controls that URL controls the app for all users with no store review, and `cleartext: true` weakens the Android network security config globally.

No mobile release pipeline exists in the repo, so this is almost certainly untouched Lovable scaffolding — but the fix is free and belongs in place before anyone attempts a build. **Remove the entire `server` block from the committed config.**

### 8.6 `server.cjs` is dead code that is one line from being live
**Severity: MEDIUM · [VERIFIED] — no deploy path references it**

Not referenced by `Dockerfile`, `docker-compose.yml`, any `package.json` script, or CI. But it is a complete network-facing HTTP server in the repo root containing: an unbounded `ogCache` `Map` that is **never evicted** (the TTL only controls reuse, not removal — an attacker enumerating `/p/<id>` grows it until OOM), an unauthenticated TMAPI-billed fetch per distinct product id, no `requestTimeout`/`headersTimeout`, no security headers, and a hardcoded rewrite of two specific old bundle hashes to a stale `tradeon-app-20260717-v8.js`.

Path traversal was **empirically tested and is not exploitable** — `urlPath` is always absolute, so `path.normalize` clamps `..` at root and `path.join` (unlike `resolve`) does not reset. That safety is incidental to the implementation rather than designed, though.

**Fix:** delete it, or quarantine it under a clearly-labelled directory.

### 8.7 Docker hardening gaps
**[VERIFIED]** — neither `Dockerfile` nor `cache-api/Dockerfile` contains a `USER` directive (grep: 0 in both), so both images run as **root**. No healthcheck on `frontend` or `redis` (only `cache-api` has one). No `deploy.resources.limits` on any service. Redis has no `--requirepass` — contained today by the project-scoped bridge network and no published ports, but free to fix.

**Verified safe, no finding:** `.dockerignore:9-11` correctly excludes `.env` / `.env.*` while re-including `staging.env.example`, so despite `Dockerfile:16` doing `COPY . .`, **`.env` is not copied into the image**. And the `VITE_*` build ARGs are a non-issue — Vite inlines every `VITE_` variable into the client bundle by design, so those values are already public in every page load; the one real secret, `TMAPI_TOKEN`, is correctly injected only at runtime via `docker-compose.yml:31` and never as a build ARG.

### 8.8 Cache header rules contain dead branches
**Severity: LOW · [REPORTED]**

Vite emits `tradeon-app-*`, `tradeon-chunk-*`, `tradeon-asset-*` — CSS included, as `tradeon-asset-<hash>.css`. All three cache configs (`public/.htaccess:19`, `Caddyfile:24-26`, `server.cjs:183`) match `asset` plus a `css` extension, so **CSS does get the correct immutable policy — there is no mismatch.** But all three also carry `style` and `live` alternatives that nothing ever emits, and no-cache rules for `sw.js` / `registerSW.js`, which don't exist (there is no PWA plugin in `vite.config.ts`). Two unused PWA icons ship to the web root, `pwa-192x192.png` being an odd 865 KB.

Dead rules, propagated by copy-paste across three files. Harmless, worth pruning.

---

## 9. Remediation plan

### Immediate — live exploitable, do first
1. **Delete `tmapi-probe`** from production. One command, removes a CRITICAL. (§5)
2. **Lock down `auth-email-hook`** — apply the bearer check already written in the same file. (§3.4)
3. **Fix `get_user_emails()`** — add the admin check + `REVOKE`. Ships as one migration. (§2.1)
4. **Rate-limit + attempt-cap the OTP endpoints**, and switch to `crypto.getRandomValues`. (§3.1, §3.2)
5. **Rotate credentials**: BulkSMS API key and TMAPI token (both sent in cleartext query strings), and `meta_capi_token` (historically world-readable). (§2.3, §3.3)
6. **Put auth + rate limiting on `cache-api` `/api/*`** — it is an open, billed API on staging today. (§8.2)

### Quick wins — small diffs, real user-facing impact
7. **Fix `normalizeImg` in `alibaba-1688-cached-search`** — a copy-paste of nine lines fixes broken product thumbnails on the live search page. (§8.1)
8. **Switch all TMAPI URLs to HTTPS** — mechanical change across ~9 files, closes a cleartext credential exposure. (§3.3)
9. **Remove the `server` block from `capacitor.config.ts`** — free now, critical later. (§8.5)

### Urgent — money integrity
10. **Move order creation server-side.** One RPC/edge function that re-derives price and is the sole writer of `unit_price`/`total_price`/`payment_amount`; revoke client INSERT on `orders`. This single change closes §1.1, §1.2's amount tampering, and most of §1.3. (§1.1)
11. **Make `paystation-verify-payment` idempotent** and stop it downgrading fulfilment status. (§1.2)
12. **Compare the amount PayStation actually collected** against the order total before marking paid. (§1.1)

### Before merging `optimization` → `main`
13. **Regenerate `bun.lock`**, clean install, confirm `bun run build` passes. Staging is broken until this is done, and production breaks on merge without it. (§7.1)
14. **Add CI gates**: `bun install --frozen-lockfile`, `bun run lint`, `bun run test`, `tsc --noEmit`. (§7.2, §7.3)
15. **Patch `vitest`, `react-router-dom`, `@supabase/supabase-js`**; **remove `@capacitor/*`** (deletes ~15 HIGH advisories). (§7.6)

### Near term
16. `REVOKE` on `has_role`; narrow the `admin_messages` UPDATE policy; `UNIQUE` on `profiles.phone` and `orders.order_number`; `CHECK (>= 0)` on money columns; index `orders.payment_invoice`. (§1.4-1.6, §2.2, §2.4, §3.5)
17. Enforce `role_permissions` in `AdminRoute`. (§4.2)
18. Rate-limit every unauthenticated third-party proxy; cap `firecrawl` limits; gate `?force=1`; make the refresh functions' delete+insert atomic. (§5)
19. Tests for `currency.ts`, `roles.ts`, cart, and the payment flow **before** touching that code further. (§7.5)

### Structural
20. Adopt react-query for the fetches its provider is already mounted for — resolves §6.1 and §6.2 as a class.
21. Reset `ProductDetail` state on product change; fix the dead rating/category filters; paginate the admin pages. (§6.3-6.5)
22. Apply the three unapplied migrations (`product_detail_cache`, `hot_path_indexes`, `rls_initplan_auth_uid`) — all written, none deployed; the index one alone removes sequential scans from every user-scoped dashboard query. (§10)

---

## 10. Unapplied migrations

Per `LOVABLE-MIGRATION-PLAN.md`, three migrations are written but never deployed — independently corroborated by `src/integrations/supabase/types.ts` (generated from the live schema) containing no `product_cache` table:

| Migration | Effect of absence |
|---|---|
| `20260824120000_product_detail_cache.sql` | No `product_cache` table → **every** product-detail view re-hits TMAPI uncached. `alibaba-1688-item-get/index.ts:300` literally logs *"product_cache read failed (is the migration applied?)"* — someone anticipated this exact drift. |
| `20260824120200_hot_path_indexes.sql` | 14 indexes on `user_id`/`created_at`/`status` across 8 tables missing → every user-scoped dashboard query and every `auth.uid() = user_id` RLS filter is a sequential scan. |
| `20260824120400_rls_initplan_auth_uid.sql` | ~60 RLS policies re-evaluate `auth.uid()`/`has_role()` **per row** instead of once per query. |

These are the three that change schema — the three duplicated no-ops that *were* re-applied are pure `CREATE OR REPLACE FUNCTION`. The Lovable Cloud MCP `query_database` channel can execute DDL, so these can land without waiting on the larger self-hosting migration.

---

## 11. What the codebase does well

Worth recording, both for calibration and to protect these from "cleanup":

- **`AdminDataTable.tsx`** — server-side pagination, `reqIdRef` sequencing against out-of-order responses, debounced search with cleanup, and a render-time page reset that a comment explains. It is the template for fixing §6.2 and §6.5.
- **`admin-send-sms` and `send-invoice-email`** — correct authorization: bearer → `getClaims`/`getUser` → explicit `has_role` check. The model for every other privileged function.
- **`PaymentCallback.tsx`** — refuses to trust the URL's `status` param for anything but the cancel short-circuit; success always comes from a server-to-server verification. Correct by design.
- **`roles.ts`** — TTL'd role cache with in-flight dedup **keyed by user id**, with a comment explaining that unconditional sharing let a fast account switch resolve the wrong user's role. That's a real bug someone found and fixed properly.
- **`cdnImage.ts`** — the `onError` fallback keys its retry state to the specific URL because React recycles `<img>` nodes between list items. Subtle, correct, documented.
- **`get_my_role()`** — takes no parameter, derives the caller from `auth.uid()`, and is the one function with a proper `REVOKE`/`GRANT`. The fix for §2.1 and §2.2 is to make the older functions look like this one.
- **The `Caddyfile` and `vite.config.ts` comments** explain *why* — the Hostinger parallel-request limit, the `Clear-Site-Data` bug that was silently signing users out, the preload-helper chunk pinning. This is genuinely good institutional memory.
- **No float money columns** anywhere, and `convertToBDT` deliberately rounds up with the reasoning written down.

---

*Findings marked [REPORTED] were identified by reading the relevant source but the exploit was not executed. Findings marked [NEEDS-LIVE-CHECK] depend on live database state this repository cannot show. Nothing here was tested against production.*
