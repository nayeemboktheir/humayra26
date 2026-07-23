# Performance Feature Audit Report

## TL;DR
- **Client-side caching:** NOT ACTIVE (actively disabled across HTTP, Service Worker, browser Cache API, and Vite build).
- **Image optimization:** PARTIALLY ACTIVE (lazy-loading on some grids, no CDN/format/compression pipeline for product images).
- **Pagination:** ACTIVE for customer product search, NOT ACTIVE for most admin tables.
- **Lazy loading / code splitting:** LARGELY NOT ACTIVE (single forced bundle, no route-level `React.lazy`).

---

## 1. Client-side caching — NOT ACTIVE (actively disabled)

| Layer | Status | Evidence |
|-------|--------|----------|
| HTTP cache headers | Disabled | `public/.htaccess:17-21` sets `Cache-Control: no-cache, no-store, must-revalidate` on all `.js`/`.css`; `index.html` and `sw.js` also get `no-cache` + `Clear-Site-Data` headers (`.htaccess:11-32`). |
| Service Worker | Disabled / self-destructing | `public/sw.js:1-19` unregisters itself, deletes caches, and forces clients to reload with a new `cache_bust` param. |
| Runtime Cache API purge | Active | `src/App.tsx:77-81` clears all `caches` keys on every mount. |
| SW unregistration | Active | `src/main.tsx:35-45` and `src/App.tsx:71-75` unregister any SW matching `/sw.js` on every load. |
| Version-bust reload | Active | `src/App.tsx:64-92` (`useBrowserCacheBust`) stores `tradeon_app_version` in `localStorage` and force-reloads the page if it changes. |
| Vite build filenames | Fixed / non-hashed | `vite.config.ts:24-26` uses `tradeon-app-20260717-v8.js` (fixed date version), so no long-term immutable caching is possible. |
| React Query | Provider only, no strategy | `src/App.tsx:61` creates a default `QueryClient` with no `staleTime`/`gcTime`/`refetchOnWindowFocus` tuning. |
| In-memory session cache | Limited | `src/pages/Index.tsx:109-126` and `src/pages/Index.tsx:203` keep search/category state only for the SPA session; lost on refresh. |

**Conclusion:** Caching was deliberately stripped to fight a Hostinger/CDN stale-asset bug. Every repeat visit re-downloads all assets. This is a trade-off for freshness, not a performance feature.

---

## 2. Image optimization — PARTIALLY ACTIVE

| Feature | Status | Evidence |
|---------|--------|----------|
| Native `loading="lazy"` | Partial (6 of ~35 images) | Used in `src/pages/Index.tsx:1170`, `src/pages/Index.tsx:1626`, `src/components/PaymentLogos.tsx:10`, `src/components/ProductSearch.tsx:190`, `src/components/ProductDetail.tsx:1096`, `src/components/CategorySection.tsx:76`. |
| Missing lazy loading | Many | `src/pages/dashboard/Wishlist.tsx`, `src/pages/dashboard/Orders.tsx`, `src/pages/dashboard/Cart.tsx`, `src/components/CheckoutDialog.tsx`, `src/pages/SellerStore.tsx`, `src/pages/admin/AdminOrders.tsx`, and other admin pages load images eagerly. |
| Image CDN / transforms | None | No Cloudinary, Imagekit, Supabase Storage transforms, or `next/image` equivalent. |
| Product image compression | None | Product images are hotlinked directly from 1688/Alibaba source URLs with `referrerPolicy="no-referrer"` (no resizing, WebP, AVIF, or `srcset`). |
| User-upload compression | Active | `src/lib/compressImage.ts:1-40` and `src/lib/cropImage.ts` compress/crop image-search uploads before sending them to the API (`src/pages/Index.tsx:498,701,996`). |
| Placeholder fallback | Active | `onError` handlers fall back to `/placeholder.svg` throughout `ProductDetail.tsx`, `CheckoutDialog.tsx`, `SellerStore.tsx`, etc. |

**Conclusion:** Lazy loading and placeholder fallbacks exist but are inconsistently applied. There is no CDN or format optimization for the images shoppers actually see.

---

## 3. Pagination — ACTIVE for product search, NOT ACTIVE for admin tables

| Feature | Status | Evidence |
|---------|--------|----------|
| 1688 product search | Active | `src/pages/Index.tsx:322-354` uses `page` and `pageSize` (20), synced to URL query params (`Index.tsx:332-335`). |
| Category browsing | Active | `src/pages/Index.tsx:365-460` implements `categoryPage`, `CATEGORY_PAGE_SIZE`, and `categoryTotalPages`. |
| Supabase `.range()` | Active | `src/pages/Index.tsx:267-268` uses `.range()` for seed category cache. |
| Seller store "Load More" | Active | `src/pages/SellerStore.tsx:167-172` uses button-triggered infinite load. |
| True infinite scroll (IntersectionObserver) | Not active | No `IntersectionObserver` usage found in the codebase. |
| Admin orders | Not paginated | `src/pages/admin/AdminOrders.tsx:108-110` fetches full table with `.select("*")` and no `.range()`/`.limit()`. |
| Admin users | Not paginated | `src/pages/admin/AdminUsers.tsx:19` same pattern. |
| Admin customers | Not paginated | `src/pages/admin/AdminCustomers.tsx:72-74` same pattern. |
| Admin transactions | Not paginated | `src/pages/admin/AdminTransactions.tsx:22` same pattern. |
| Admin refunds | Not paginated | `src/pages/admin/AdminRefunds.tsx:21` same pattern. |
| Admin wishlist | Not paginated | `src/pages/admin/AdminWishlist.tsx:19` same pattern. |
| Admin shipments | Not paginated | `src/pages/admin/AdminShipments.tsx:38-39` same pattern. |
| Admin SMS | Hard cap, not pagination | `src/pages/admin/AdminSMS.tsx:60,77` uses `.limit(500)` and `.limit(2000)`, silently truncating data beyond the cap. |

**Conclusion:** Customer-facing product search/browse is properly paginated. Admin back-office tables will not scale as data grows because they load entire tables client-side.

---

## 4. Lazy loading / code splitting — LARGELY NOT ACTIVE

| Feature | Status | Evidence |
|---------|--------|----------|
| Route-level `React.lazy` | Not used | All pages in `src/App.tsx:14-59` are static top-level imports; no `React.lazy` or `lazy(() =>` found anywhere in `src/`. |
| Vite chunk splitting | Disabled | `vite.config.ts:19` sets `inlineDynamicImports: true` to keep the SPA in a single JS bundle (comment at `vite.config.ts:16-18` explains the Hostinger rate-limiting workaround). |
| Heavy library dynamic imports | Present but mooted | `src/components/OrderInvoice.tsx:301-302` lazily imports `html2canvas`/`jspdf`; `src/components/ImageCropper.tsx:18` lazily imports `react-easy-crop`. Because the bundle is forced into one file, these still ship on first load. |
| `Suspense`/`PageLoader` | Present but unused for routes | `src/App.tsx:1,11` and `App.tsx:109-125` wrap routes in `Suspense`, but since no routes are lazy, nothing suspends. |

**Conclusion:** Code splitting exists in intent but is structurally disabled. The entire app ships as one monolithic JS bundle on every visit.

---

## Key Problems Found
1. **Anti-caching everywhere** — assets never cache, causing full re-downloads on repeat visits.
2. **Single forced JS bundle** — no benefit from route-level code splitting even if it were added.
3. **Admin tables unbounded** — 7+ admin pages fetch entire tables; will degrade as data grows.
4. **No product-image CDN/format pipeline** — raw hotlinked source images, no responsive formats.
5. **Inconsistent image lazy loading** — only a fraction of images use `loading="lazy"`.

## Open Questions
- Is the aggressive anti-caching setup still needed, or was it a temporary fix for a now-resolved Hostinger CDN bug?
- Do you want to keep the single-bundle build to avoid Hostinger chunking issues, or can we safely re-enable chunking?
- Which admin tables are the most urgent to paginate?

## Proposed Next Steps (if you approve)
1. **Caching:** Decide whether to relax anti-caching headers or keep the current "always fresh" behavior.
2. **Admin pagination:** Add server-side pagination with page size controls to the 7+ unbounded admin list pages.
3. **Image optimization:** Add `loading="lazy"` to the remaining images and optionally proxy/resize product images through a CDN or Supabase Storage transform.
4. **Code splitting:** Re-enable Vite chunking and add `React.lazy` route splitting once the Hostinger deployment path is stable.

Approve this plan if you want me to start implementing any of these fixes. Otherwise, let me know which area to tackle first.