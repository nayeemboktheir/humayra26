import { describe, it, expect } from "vitest";
import { cdnImage, cdnSrcSet, cdnImageFallback } from "@/lib/cdnImage";

const ALICDN = "https://cbu01.alicdn.com/img/ibank/O1CN01hcgHP51nIHYLPqiTh_!!2220460965066-0-cib.jpg";
const webp = (url: string, size: number) => `${url}_${size}x${size}q75.jpg_.webp`;

describe("cdnImage", () => {
  it("appends a sized WebP derivative suffix to alicdn URLs", () => {
    expect(cdnImage(ALICDN, 400)).toBe(webp(ALICDN, 400));
    expect(cdnImage(ALICDN, 200)).toBe(webp(ALICDN, 200));
  });

  it("handles other alicdn subdomains", () => {
    const u = "https://img.alicdn.com/imgextra/i1/abc.jpg";
    expect(cdnImage(u, 400)).toBe(webp(u, 400));
    const u2 = "https://cbu02.alicdn.com/img/ibank/x.png";
    expect(cdnImage(u2, 400)).toBe(webp(u2, 400));
  });

  it("handles 1688's own image CDN, which serves the same derivatives", () => {
    const u = "https://global-img-cdn.1688.com/img/ibank/O1CN01COI9fI1EveqQLU3QY_!!3193120414-0-cib.jpg";
    expect(cdnImage(u, 250)).toBe(webp(u, 250));
  });

  it("leaves non-image 1688.com URLs untouched", () => {
    const page = "https://detail.1688.com/offer/123.html";
    expect(cdnImage(page, 400)).toBe(page);
  });

  it("leaves non-CDN URLs untouched", () => {
    expect(cdnImage("https://example.com/a.jpg", 400)).toBe("https://example.com/a.jpg");
    expect(cdnImage("/placeholder.svg", 400)).toBe("/placeholder.svg");
    expect(cdnImage("https://supabase.co/storage/v1/x.png", 400)).toBe(
      "https://supabase.co/storage/v1/x.png",
    );
  });

  it("does not stack a second size suffix", () => {
    expect(cdnImage(`${ALICDN}_400x400.jpg`, 200)).toBe(`${ALICDN}_400x400.jpg`);
    // Including one this module produced itself.
    expect(cdnImage(webp(ALICDN, 400), 200)).toBe(webp(ALICDN, 400));
  });

  it("leaves URLs with query strings alone, since the suffix would break the path", () => {
    const q = `${ALICDN}?v=2`;
    expect(cdnImage(q, 400)).toBe(q);
  });

  it("returns an empty string for missing values rather than 'undefined'", () => {
    expect(cdnImage(undefined, 400)).toBe("");
    expect(cdnImage(null, 400)).toBe("");
    expect(cdnImage("", 400)).toBe("");
  });

  it("trims surrounding whitespace", () => {
    expect(cdnImage(`  ${ALICDN}  `, 400)).toBe(webp(ALICDN, 400));
  });
});

describe("cdnSrcSet", () => {
  it("emits one width-descriptor candidate per requested size", () => {
    expect(cdnSrcSet(ALICDN, [200, 400])).toBe(
      `${webp(ALICDN, 200)} 200w, ${webp(ALICDN, 400)} 400w`,
    );
  });

  it("returns undefined for URLs the CDN cannot resize, so the attribute is dropped", () => {
    expect(cdnSrcSet("https://example.com/a.jpg", [200, 400])).toBeUndefined();
    expect(cdnSrcSet(undefined, [200])).toBeUndefined();
    // An already-sized URL has no derivable base to build candidates from.
    expect(cdnSrcSet(`${ALICDN}_400x400.jpg`, [200])).toBeUndefined();
  });
});

describe("cdnImageFallback", () => {
  const ORIGINAL = "https://cbu01.alicdn.com/img/ibank/abc.jpg";

  function imgWith(src: string, srcset?: string) {
    const img = document.createElement("img");
    img.setAttribute("src", src);
    if (srcset) img.setAttribute("srcset", srcset);
    return img;
  }
  const fire = (handler: any, img: HTMLImageElement) => handler({ currentTarget: img });

  it("steps down to the same-size JPEG before the full-size original", () => {
    const img = imgWith(cdnImage(ORIGINAL, 250));
    const onError = cdnImageFallback(ORIGINAL);
    fire(onError, img);
    expect(img.getAttribute("src")).toBe(`${ORIGINAL}_250x250.jpg`);
    fire(onError, img);
    expect(img.getAttribute("src")).toBe(ORIGINAL);
  });

  it("drops srcset, which would otherwise outrank every src it sets", () => {
    const img = imgWith(cdnImage(ORIGINAL, 250), cdnSrcSet(ORIGINAL, [250, 400]));
    fire(cdnImageFallback(ORIGINAL), img);
    expect(img.hasAttribute("srcset")).toBe(false);
    expect(img.getAttribute("src")).toBe(`${ORIGINAL}_250x250.jpg`);
  });

  it("falls through to the placeholder when the original also fails", () => {
    const img = imgWith(cdnImage(ORIGINAL, 400));
    const onError = cdnImageFallback(ORIGINAL);
    fire(onError, img); // -> sized jpeg
    fire(onError, img); // -> original
    fire(onError, img); // -> placeholder
    expect(img.getAttribute("src")).toBe("/placeholder.svg");
  });

  it("stops after the placeholder instead of looping forever", () => {
    const img = imgWith(cdnImage(ORIGINAL, 400));
    const onError = cdnImageFallback(ORIGINAL);
    fire(onError, img);
    fire(onError, img);
    fire(onError, img);
    const settled = img.getAttribute("src");
    // Any number of further errors must not change the src or re-enter the retry.
    for (let i = 0; i < 5; i++) fire(onError, img);
    expect(img.getAttribute("src")).toBe(settled);
    expect(settled).toBe("/placeholder.svg");
  });

  it("still retries from the top when React recycles the node for another product", () => {
    // Node has already been driven to the placeholder for product A...
    const img = imgWith(cdnImage(ORIGINAL, 400));
    const a = cdnImageFallback(ORIGINAL);
    fire(a, img);
    fire(a, img);
    fire(a, img);
    expect(img.getAttribute("src")).toBe("/placeholder.svg");

    // ...and is now reused for product B. B must get its own retry chain.
    const OTHER = "https://cbu01.alicdn.com/img/ibank/zzz.jpg";
    img.setAttribute("src", cdnImage(OTHER, 400));
    const b = cdnImageFallback(OTHER);
    fire(b, img);
    expect(img.getAttribute("src")).toBe(`${OTHER}_400x400.jpg`);
  });

  it("goes straight to the placeholder when there is no original URL", () => {
    const img = imgWith("");
    fire(cdnImageFallback(undefined), img);
    expect(img.getAttribute("src")).toBe("/placeholder.svg");
  });
});
