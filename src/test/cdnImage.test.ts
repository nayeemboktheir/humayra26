import { describe, it, expect } from "vitest";
import { cdnImage, cdnImageFallback } from "@/lib/cdnImage";

const ALICDN = "https://cbu01.alicdn.com/img/ibank/O1CN01hcgHP51nIHYLPqiTh_!!2220460965066-0-cib.jpg";

describe("cdnImage", () => {
  it("appends a size suffix to alicdn URLs", () => {
    expect(cdnImage(ALICDN, 400)).toBe(`${ALICDN}_400x400.jpg`);
    expect(cdnImage(ALICDN, 200)).toBe(`${ALICDN}_200x200.jpg`);
  });

  it("handles other alicdn subdomains", () => {
    const u = "https://img.alicdn.com/imgextra/i1/abc.jpg";
    expect(cdnImage(u, 400)).toBe(`${u}_400x400.jpg`);
    const u2 = "https://cbu02.alicdn.com/img/ibank/x.png";
    expect(cdnImage(u2, 400)).toBe(`${u2}_400x400.jpg`);
  });

  it("leaves non-alicdn URLs untouched", () => {
    expect(cdnImage("https://example.com/a.jpg", 400)).toBe("https://example.com/a.jpg");
    expect(cdnImage("/placeholder.svg", 400)).toBe("/placeholder.svg");
    expect(cdnImage("https://supabase.co/storage/v1/x.png", 400)).toBe(
      "https://supabase.co/storage/v1/x.png",
    );
  });

  it("does not stack a second size suffix", () => {
    const sized = `${ALICDN}_400x400.jpg`;
    expect(cdnImage(sized, 200)).toBe(sized);
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
    expect(cdnImage(`  ${ALICDN}  `, 400)).toBe(`${ALICDN}_400x400.jpg`);
  });
});

describe("cdnImageFallback", () => {
  const ORIGINAL = "https://cbu01.alicdn.com/img/ibank/abc.jpg";

  function imgWith(src: string) {
    const img = document.createElement("img");
    img.setAttribute("src", src);
    return img;
  }
  const fire = (handler: any, img: HTMLImageElement) => handler({ currentTarget: img });

  it("retries the untouched original before the placeholder", () => {
    const img = imgWith(cdnImage(ORIGINAL, 400));
    const onError = cdnImageFallback(ORIGINAL);
    fire(onError, img);
    expect(img.getAttribute("src")).toBe(ORIGINAL);
  });

  it("falls through to the placeholder when the original also fails", () => {
    const img = imgWith(cdnImage(ORIGINAL, 400));
    const onError = cdnImageFallback(ORIGINAL);
    fire(onError, img); // -> original
    fire(onError, img); // -> placeholder
    expect(img.getAttribute("src")).toBe("/placeholder.svg");
  });

  it("stops after the placeholder instead of looping forever", () => {
    const img = imgWith(cdnImage(ORIGINAL, 400));
    const onError = cdnImageFallback(ORIGINAL);
    fire(onError, img);
    fire(onError, img);
    const settled = img.getAttribute("src");
    // Any number of further errors must not change the src or re-enter the retry.
    for (let i = 0; i < 5; i++) fire(onError, img);
    expect(img.getAttribute("src")).toBe(settled);
    expect(settled).toBe("/placeholder.svg");
  });

  it("still retries the original when React recycles the node for another product", () => {
    // Node has already been driven to the placeholder for product A...
    const img = imgWith(cdnImage(ORIGINAL, 400));
    const a = cdnImageFallback(ORIGINAL);
    fire(a, img);
    fire(a, img);
    expect(img.getAttribute("src")).toBe("/placeholder.svg");

    // ...and is now reused for product B. B must get its own original-URL retry.
    const OTHER = "https://cbu01.alicdn.com/img/ibank/zzz.jpg";
    img.setAttribute("src", cdnImage(OTHER, 400));
    const b = cdnImageFallback(OTHER);
    fire(b, img);
    expect(img.getAttribute("src")).toBe(OTHER);
  });

  it("goes straight to the placeholder when there is no original URL", () => {
    const img = imgWith("");
    fire(cdnImageFallback(undefined), img);
    expect(img.getAttribute("src")).toBe("/placeholder.svg");
  });
});
