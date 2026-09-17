import { describe, it, expect } from "vitest";
// The Deno edge-function copy, shared by all the alibaba-1688-* / refresh-* functions.
import { normalizeImg } from "../../supabase/functions/_shared/normalize-img";

// There used to be a second, hand-maintained Node copy in cache-api/src/tmapiMap.js,
// and this file asserted the two agreed. They had already drifted once: only
// alibaba-1688-item-get carried the full normaliser, so search, image-search,
// seller-products and both homepage refresh jobs served un-normalised image URLs
// (audit §8.1). cache-api is gone and _shared/normalize-img.ts is now the single
// implementation, which removes that class of bug — these cases still pin its
// behaviour, because the URL shapes below are the ones that actually broke.
const CASES: Array<[string, string, string]> = [
  ["empty input", "", ""],
  [
    "protocol-relative url",
    "//img.alicdn.com/imgextra/a.jpg",
    "https://img.alicdn.com/imgextra/a.jpg",
  ],
  [
    "itemcdn proxy wrapper with percent-encoded quotes",
    'https://itemcdn.tmall.com/%22https://img.alicdn.com/b.jpg%22/',
    "https://img.alicdn.com/b.jpg",
  ],
  [
    "itemcdn proxy wrapper with literal quotes",
    'https://itemcdn.tmall.com/"https://img.alicdn.com/c.jpg"',
    "https://img.alicdn.com/c.jpg",
  ],
  [
    "html-entity encoded ampersand",
    "https://img.alicdn.com/d.jpg?a=1&amp;b=2",
    "https://img.alicdn.com/d.jpg?a=1&b=2",
  ],
  [
    "stray backslashes and surrounding quotes",
    '"https:\/\/img.alicdn.com\/e.jpg"',
    "https://img.alicdn.com/e.jpg",
  ],
  [
    "already-clean url is untouched",
    "https://img.alicdn.com/f.jpg",
    "https://img.alicdn.com/f.jpg",
  ],
];

describe("normalizeImg", () => {
  it.each(CASES)("%s", (_name, input, expected) => {
    expect(normalizeImg(input)).toBe(expected);
  });
});
