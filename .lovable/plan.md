## Fix Lighthouse Insights (cache lifetimes + render-blocking CSS)

The report flags two issues. Only the first-party ones are fixable — Facebook Pixel cache TTLs are set by Meta's CDN and cannot be changed.

### 1. Extend cache lifetime for first-party static assets (PNG/CSS/hashed JS)

Current `public/.htaccess` and `server.cjs` mark **all** JS/CSS as `no-cache, no-store, must-revalidate` to defeat Hostinger's stale-bundle problem. That's why the two `tradeon-a…png` assets and the CSS are served with short/no cache and flagged by Lighthouse.

Fix by splitting cache policy based on filename pattern:

- **Long cache (1 year, immutable)** — anything whose filename contains a content hash or version tag, matching Vite's output:
  - `assets/tradeon-app-20260717-v8.js`
  - `assets/tradeon-chunk-20260717-v8-*.js`
  - `assets/tradeon-asset-20260717-v8-*.{png,jpg,svg,woff2,css,…}`
  - `assets/tradeon-style-*.css`
  - Any `assets/*-[hash].*`
- **No-cache** — only the entry documents that must always be fresh:
  - `index.html`
  - `sw.js`, `registerSW.js`, `manifest.webmanifest`
  - `favicon*`

Files to edit:
- `public/.htaccess`: replace the blanket `<FilesMatch "\.(js|css)$">` no-cache block with a `FilesMatch` that targets hashed/versioned asset filenames with `Cache-Control: public, max-age=31536000, immutable`, and keep no-cache only for the entry files listed above.
- `server.cjs`: update `noCacheExtensions` logic — files under `/assets/` served with hashed names get `public, max-age=31536000, immutable`; only `index.html` / `sw.js` / manifest / favicon stay no-cache. The existing `noCacheFiles` set already handles those.

This is safe because the Vite config already emits versioned filenames (`tradeon-app-20260717-v8.js`) and bumps the version tag on rebuild, so long caching won't cause staleness — `index.html` (always fresh) references the new filename on each deploy.

### 2. Reduce render-blocking CSS (~110 ms)

The 13.5 KiB `tradeon-style-*.css` is loaded via a normal `<link rel="stylesheet">` in the built `index.html`, blocking render. Add Vite's built-in CSS-inlining plugin behavior isn't available for the entry stylesheet by default, so:

- Add a preload hint in `index.html` `<head>`:
  ```html
  <link rel="preload" as="style" href="/assets/tradeon-style-… .css" onload="this.rel='stylesheet'" />
  ```
  Since the CSS filename is hashed, use a small inline script in `index.html` that upgrades any `<link rel="stylesheet" href="/assets/tradeon-style-*.css">` to `rel="preload"` + swap on load, OR install `vite-plugin-html` / use a Vite `transformIndexHtml` hook to rewrite the emitted `<link>` at build time.

Simpler approach chosen: add a small `transformIndexHtml` plugin in `vite.config.ts` that rewrites the emitted stylesheet `<link>` to use `rel="preload" as="style" onload="this.rel='stylesheet'"` with a `<noscript>` fallback. This is a standard Filament Group loadCSS pattern and turns the CSS request into a non-blocking one.

### What is NOT fixed and why

- **Facebook Pixel (251 KiB, 20 min TTL, `/tr` 0 KiB no cache)**: served by `connect.facebook.net` / `www.facebook.com`. Cache headers are controlled by Meta; we can't override them. Only way to eliminate the flag is to remove the Pixel, which conflicts with the marketing-tracking requirement — leaving as-is.

### Verification

After deploying:
- `curl -I https://tradeon.global/assets/tradeon-app-20260717-v8.js` should show `Cache-Control: public, max-age=31536000, immutable`.
- `curl -I https://tradeon.global/index.html` should still show `no-cache`.
- Re-run Lighthouse — the "Use efficient cache lifetimes" first-party rows and the render-blocking CSS row should drop off.
