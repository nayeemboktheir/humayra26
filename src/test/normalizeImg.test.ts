import { describe, it, expect } from "vitest";
// The Deno edge-function copy (shared by all six alibaba-1688-* / refresh-* functions)…
import { normalizeImg as edgeNormalizeImg } from "../../supabase/functions/_shared/normalize-img";
// …and the Node copy used by the staging cache-api.
import { normalizeImg as nodeNormalizeImg } from "../../cache-api/src/tmapiMap.js";

// CLAUDE.md requires these two implementations stay behaviourally identical — there is
// no shared module across the Deno/Node boundary, so the only thing keeping them in sync
// is discipline. They had already drifted once: only alibaba-1688-item-get carried the
// full normaliser, so search, image-search, seller-products and both homepage refresh
// jobs served un-normalised image URLs (audit §8.1). These cases pin the behaviour.
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
  it.each(CASES)("edge function: %s", (_name, input, expected) => {
    expect(edgeNormalizeImg(input)).toBe(expected);
  });

  it.each(CASES)("cache-api: %s", (_name, input, expected) => {
    expect(nodeNormalizeImg(input)).toBe(expected);
  });

  it("the two implementations agree on every case", () => {
    for (const [, input] of CASES) {
      expect(edgeNormalizeImg(input)).toBe(nodeNormalizeImg(input));
    }
  });
});
