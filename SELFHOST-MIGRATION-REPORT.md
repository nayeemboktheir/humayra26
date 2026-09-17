# Self-hosted Supabase migration — rehearsal report

**Date:** 2026-09-18
**Status:** rehearsal complete and passing; production cutover not started
**Scope:** move TradeOn's backend off Lovable Cloud onto a self-hosted Supabase
stack, and measure the performance work that was blocked by not owning it.

---

## 1. Summary

A full copy of production now runs on a self-hosted Supabase stack at
`https://api.tradeon.global`, and the staging frontend (`trade.botbhai.net`)
runs against it with **zero errors and zero failed requests**.

Nothing in production has been changed. `tradeon.global` still points at the
Lovable-managed backend and is unaffected by everything below.

Three previously-unapplied database migrations were applied to the rehearsal
stack and measured against real data volumes. Two produced large, verified wins.
A fourth change — the image pipeline — was measured and is the single biggest
user-facing improvement available, and it is already written but unmerged.

**The one-line recommendation:** merge the `optimization` branch and apply the
two cache/index migrations to production. Everything needed is written, tested
and measured; none of it requires the self-hosted migration to happen first.

---

## 2. What was migrated and verified

### The stack

| Component | Version |
|---|---|
| Postgres | `supabase/postgres:17.6.1.173` |
| Auth (GoTrue) | `v2.186.0` |
| REST (PostgREST) | `v14.6` |
| Storage | `v1.44.2` on MinIO |
| Edge runtime | `v1.71.2` |
| Realtime | `v2.76.5` |
| Gateway (Kong) | `3.9.1` |

Hosted in Coolify, service `emhbzh3hwap5rmq6ysysloil`, fronted by Cloudflare.

### Data

Restored from a genuine `pg_dump` (Lovable's *Export project data* produces one —
contrary to the earlier assumption that no export channel existed). All 16 parity
checks matched:

| | |
|---|---|
| Tables / functions / triggers | 18 / 12 / 13 |
| RLS policies / tables with RLS | 64 / 18 |
| Foreign keys | 12 |
| `auth.users` / `auth.identities` | 724 / 724 |
| Orders / shipments | 909 / 1,579 |
| Profiles / wallets | 724 / 724 |
| Orphaned rows / duplicate profiles / duplicate wallets | 0 / 0 / 0 |
| Password hashes intact | 724 / 724 `$2a$` bcrypt |

Verified through the public API as well as SQL: `service_role` sees correct
counts, `anon` reads `category_products` but receives `[]` for `orders` — so
**RLS is enforcing correctly**.

### Also completed

- 8 cron jobs recreated and active (they existed only as untracked database rows;
  they are now version-controlled in `supabase/selfhost/04_cron.sql`)
- 17 edge functions deployed and responding; TMAPI path verified end to end
- Auth restored after a configuration fault (see §5)

---

## 3. Measured results

All figures measured on the live rehearsal stack with production-copy data, not
projected.

### Backend

| Path | Before | After | Change |
|---|---|---|---|
| Product detail (repeat view) | 3.2–4.6 s | **0.19 s** | **23×** |
| Search (repeat query) | 3.03 s | **0.23 s** | **13×** |
| Product detail payload | 30,680 B | **11,247 B** | **−63%** |

Product detail previously made **three upstream calls on every single view** —
two billed TMAPI requests plus an HTML scrape of the 1688 product page — because
the `product_cache` table had never been created. Caching also removes two billed
TMAPI calls per repeat view, so this reduces running cost as well as latency.

### Database indexes

`hot_path_indexes` was applied and benchmarked with `EXPLAIN (ANALYZE, BUFFERS)`.
Postgres does not auto-index foreign keys, so **none of the 14 `user_id` columns
were indexed** — every user-scoped page read its entire table.

| Query | Before | After | Plan | Blocks read |
|---|---|---|---|---|
| My cart | 7.04 ms | **0.07 ms** | Seq Scan → Bitmap Index Scan | **200 → 3** |
| My notifications | 2.38 ms | 0.06 ms | Seq+Sort → Index Scan | 64 → 6 |
| My wishlist | 1.82 ms | 0.07 ms | Seq+Sort → Index Scan | 64 → 3 |
| My shipments | 1.54 ms | 0.11 ms | Seq+Sort → Index Scan | 22 → 11 |
| My transactions | 1.00 ms | 0.05 ms | Seq+Sort → Index Scan | 7 → 3 |
| My orders | 0.83 ms | 0.08 ms | Seq+Sort → Index Scan | 139 → 21 |
| Admin orders list | 0.64 ms | 0.09 ms | Seq+Sort → Index Scan | 136 → 46 |
| Admin users list | 0.90 ms | 0.15 ms | Seq+Sort → Index Scan | 12 → 10 |

The cart query was reading **1,919 rows to return 1**. Every `Sort` node
disappeared, because the composite `(user_id, created_at DESC)` satisfies both
filter and ordering in one pass.

**Caveat, stated plainly:** at current data volumes these absolute timings are
sub-millisecond either way and no user will perceive the difference today. The
case for these indexes is that the cost grows linearly with rows while nothing
warns you. The durable metric is blocks read — a 98% reduction on the cart query.

**Two results in the raw output are not index wins** and should not be quoted as
such: `trending_products` (15 rows) and `role_permissions` (52 rows) still show
`Seq Scan` afterwards, correctly, because the planner ignores an index at that
size. Their timings moved only because of buffer-cache warmth.

### Frontend, on the self-hosted backend

`trade.botbhai.net` rebuilt against `api.tradeon.global`:

- **Zero console errors**
- **Zero failed requests**
- All backend calls HTTP 200 (`app_settings`, `trending_products`,
  `get_category_products`), responding in 99–210 ms

### Image pipeline — the largest user-facing item

Lighthouse, both runs mobile / 4× CPU throttle (identical settings):

| Metric | Production (`main`) | Staging (`optimization`) |
|---|---|---|
| Performance score | 61 | **67** |
| First Contentful Paint | 3.1 s | 2.8 s |
| Largest Contentful Paint | 7.9 s | **5.6 s** |
| Time to Interactive | 10.0 s | **7.9 s** |
| Oversized images | **11.8 MB across 69 images** | 0.1 MB across 8 |
| **Total page weight** | **14,111 KiB** | **2,019 KiB** |

Production serves full-resolution alicdn originals (671 KB, 575 KB, 497 KB each)
into ~175 px thumbnails. `src/lib/cdnImage.ts` rewrites those to sized WebP
derivatives, and it **has never been deployed to `main`** — verified by
inspecting the live production bundle.

**Page weight drops 86%: 14.1 MB → 2.0 MB.** For a customer base on mobile data
in Bangladesh, that is the most consequential number in this report.

---

## 4. What is *not* fixed by any of the above

Merging the image work will **not** make the site "instant". Staging still
measures 5.6 s LCP on mobile. The remaining bottleneck is the request waterfall:

| LCP phase | Time |
|---|---|
| TTFB | 602 ms |
| **Load Delay** | **3,883 ms** |
| Load Time | 535 ms |
| Render Delay | 579 ms |

**69% of LCP is delay before the image is even requested.** The chain is: HTML →
download and parse the JS bundle → React mounts → fetch `get_category_products`
→ render → only now is the image URL known → request it. The browser is idle for
roughly four seconds because the LCP image URL does not exist in the HTML.

Supporting figures: 2.9 s main-thread work, 0.9 s JS bootup, 246 KiB unused
JavaScript, 24 KiB legacy transpilation.

Addressing it is separate work, roughly in order of leverage:

1. **Break the waterfall** — start the category fetch from an inline script in
   `index.html` before the bundle parses, and have React consume the in-flight
   promise. Likely 1–2 s off LCP; the biggest single lever.
2. **Cut unused JavaScript and main-thread work** — attacks TBT and TTI directly.
3. **Raise the browser target** to drop legacy transpilation.
4. **Prerender the homepage shell** so the LCP image is discoverable in the HTML.
   Largest win, largest change.

Also observed: `app_settings` is fetched **three times** and `trending_products`
and `get_category_products` **twice each** on a single page load — the duplicate
query issue recorded in `AUDIT.md §6.2`, wasting round-trips on the critical path.

---

## 5. Findings and corrections

Things discovered during the rehearsal that were not known beforehand.

**Lovable does have a working export.** The *Export project data* button produces
a real `pg_dump` custom-format archive. `LOVABLE-MIGRATION-PLAN.md` and
`CLAUDE.md` both state no automated transfer exists. This removed most of the
planned custom export tooling.

**The migration files cannot be replayed.** `supabase_migrations` records 33
versions against 43 files. Three RPCs were applied by hand and never recorded;
`product_detail_cache`, `rate_limits` and `hot_path_indexes` were never applied
at all. `supabase db push` would produce a database matching neither production
nor the repository.

**627 MB of storage was garbage.** `temp-images` held 16,273 objects that
`alibaba-1688-image-search` intends to delete after 15 minutes via a `setTimeout`
that never survives the request. No row in any table references a storage URL.
The buckets were created empty and nothing was migrated. *The leak itself is
still live in production and warrants a cleanup job.*

**Lovable runs a newer GoTrue than the self-hosted stack** — 27 auth tables
versus 20. The extra tables (SCIM, WebAuthn, MFA recovery) are all empty, so
nothing was lost, but the self-hosted auth is running behind production and
should be upgraded before cutover.

**Dead code removed.** Five edge functions had no callers: three Firecrawl
proxies, the OTAPI-based `alibaba-1688-search`, and `translate-text`. The
Firecrawl endpoints were unauthenticated and would scrape any URL on request,
billed to the company's Firecrawl account. Removed along with their frontend
wrappers. **They remain deployed on Lovable production and should be deleted or
their API keys revoked.**

**`cache-api` was removed.** The Node + Redis service existed only because the
Lovable backend could not be deployed to. The edge functions already implement
the same cache-aside against Postgres. Its `tmapiMap.js` was a hand-maintained
copy of the edge-function mapping that had already drifted and shipped broken
product thumbnails to production (`AUDIT.md §8.1`). Staging is now structurally
identical to production, which it was not before.

**Two redundant indexes were caught** in `hot_path_indexes` — `idx_profiles_user_id`
and `idx_wallets_user_id` duplicated existing UNIQUE constraints. Removed from
the migration before it reaches production.

### Corrections to earlier statements made during this work

- **"Staging scores 97 versus production 61"** was wrong: that compared a desktop
  Lighthouse run to a mobile one. On identical mobile settings it is **67 vs 61**.
  The image work is still a large win on page weight (−86%), but it does not by
  itself make the site fast.
- **`admin-send-sms` needed no code change.** It already verifies its own JWT and
  admin role, so the self-hosted global `FUNCTIONS_VERIFY_JWT=false` does not
  expose it. Verified live.
- **The OTAPI response shape is not load-bearing** for the current frontend, as
  initially assumed. `parseRawProduct` was dead code; removing the server-side
  mirror cut 63% of the product payload safely.

---

## 6. Incidents during the rehearsal

**Auth outage on the rehearsal stack (~3 hours).** GoTrue was given
`GOTRUE_HOOK_SEND_EMAIL_URI=http://supabase-edge-functions:9000/...`. GoTrue
rejects a plain-HTTP hook URI unless the host is localhost, fails configuration
load, and crash-loops. Auth returned 503 while REST stayed healthy. Fixed by
using the HTTPS URL. No production impact. Documented in
`supabase/selfhost/README.md` so it cannot recur silently.

**Credential exposure.** A `docker inspect` of the stack was run with an
inadequate redaction pattern, placing several internal service credentials into a
working transcript — including the Postgres password and the Studio dashboard
credentials. Postgres is not publicly reachable (ports 5432/6543 are filtered),
but **Studio is**: `https://api.tradeon.global/` serves it behind HTTP Basic auth
using `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD`, which guards full SQL access
to 724 real users' data. **Rotating that pair is the highest-priority outstanding
item.** A full credential regeneration is advisable when the stack is rebuilt for
the real cutover.

---

## 7. Outstanding before production cutover

| Item | Priority | Notes |
|---|---|---|
| Rotate dashboard credentials | **High** | Internet-facing, guards full SQL access |
| Verify auth email end to end | High | Hook configured but unconfirmed; needs one real signup |
| Backups | High | Nothing backs up the self-hosted stack; Lovable did this invisibly |
| PayStation configuration | High | Deferred deliberately — it bills live |
| PayStation callback URL update | **High** | Points at the old project; breaks payments *silently* |
| Upgrade GoTrue | Medium | Self-hosted auth is behind production |
| Delete/revoke dead Lovable functions | Medium | Firecrawl endpoints are an open billed proxy |
| Move stack off the Coolify host | Medium | Control plane and production DB share a blast radius |
| Fix the `temp-images` leak | Low | 627 MB of scratch files, growing |
| Verify a real login with a real password | **High** | Only assumption not yet fully proven |

On that last point: password hashes were confirmed intact and GoTrue was shown to
verify an externally written `$2a$` hash, but no migrated account has been logged
into with its genuine password, because none is known to the migration team. This
must be confirmed before cutover.

---

## 8. Recommendation

**These are independent of the self-hosted migration and can ship to production
now:**

1. **Merge `optimization` → `main`.** Page weight 14.1 MB → 2.0 MB. Fix the
   non-atomic FTP deploy first (`AUDIT.md §8.3`): it uploads `index.html`
   alongside its chunks, so a visitor mid-deploy can receive HTML referencing an
   asset that has not finished uploading.
2. **Apply `product_detail_cache` to production.** 23× on product detail,
   measured, and it cuts TMAPI spend.
3. **Apply `hot_path_indexes` to production.** Preventative rather than
   immediately visible.

**Then, for the cutover itself:** resolve §7, rehearse once more end to end
including checkout against PayStation's sandbox, and schedule the window.

**Separately, for actual "instant" load:** §4 is a distinct piece of work and the
larger engineering effort. It should not block any of the above.

---

## 9. Artifacts

Everything is committed on the `optimization` branch.

| Path | Purpose |
|---|---|
| `supabase/selfhost/README.md` | Runbook, stack details, known gotchas |
| `supabase/selfhost/restore.md` | The restore procedure, with reasoning |
| `supabase/selfhost/restore.sh` | Automated 5-pass restore, refuses unsafe input |
| `supabase/selfhost/deploy-functions.sh` | Edge function deploy + smoke test |
| `supabase/selfhost/verify.sql` | Parity checks |
| `supabase/selfhost/bench-hot-paths.sql` | Index benchmark, results in header |
| `supabase/selfhost/04_cron.sql` | The 8 cron jobs, version-controlled |
| `supabase/selfhost/01`–`03`, `99` | Schema/RLS/auth-import tooling (superseded by the dump restore, retained as documentation and fallback) |

The production dump used for the restore contains every user's password hash,
emails, phone numbers, addresses and payment references. It is gitignored. It
should be deleted from all machines once the migration completes.
