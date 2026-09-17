// Single source of truth for TMAPI image-URL normalisation.
//
// TMAPI returns product image URLs in several broken shapes: protocol-relative
// (`//img.alicdn.com/...`), wrapped in the `itemcdn.tmall.com/"<real-url>"` proxy
// form (sometimes percent-encoded as %22), carrying stray backslashes or quotes,
// and with `&` HTML-entity-encoded as `&amp;`. Every path that maps a TMAPI
// response into our own product shape has to apply all of these, or the browser
// requests a URL that 404s and the user sees a broken thumbnail.
//
// This used to be copy-pasted per function and the copies drifted: only
// alibaba-1688-item-get had the full version, so search, image-search,
// seller-products and both homepage refresh jobs shipped the protocol-relative
// fix alone. Import from here instead of re-declaring it.
//
// There was also a Node twin in `cache-api/src/tmapiMap.js` that had to be kept
// behaviourally identical by hand. cache-api is gone, so this is now the single
// implementation — keep it that way.
export function normalizeImg(u: string): string {
  if (!u) return '';
  let cleaned = String(u).trim().replace(/\\/g, '').replace(/^['"]+|['"]+$/g, '');
  cleaned = cleaned.replace(/^https?:\/\/itemcdn\.tmall\.com\/%22(https?:\/\/[^%]+)%22\/?$/i, '$1');
  cleaned = cleaned.replace(/^https?:\/\/itemcdn\.tmall\.com\/["']?(https?:\/\/[^"']+?)["']?\/?$/i, '$1');
  cleaned = cleaned.replace(/&amp;/g, '&');
  if (cleaned.startsWith('//')) return `https:${cleaned}`;
  return cleaned;
}
