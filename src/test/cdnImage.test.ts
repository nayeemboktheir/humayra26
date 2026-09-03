import { describe, it, expect } from "vitest";
import { cdnImage } from "@/lib/cdnImage";

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
