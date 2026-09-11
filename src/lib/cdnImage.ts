/**
 * Alibaba's image CDNs serve resized/re-encoded derivatives when a suffix is appended
 * to the path, e.g.
 *   .../O1CN01abc_!!123-0-cib.jpg                    -> ~800x800 original, 100-300 KB
 *   .../O1CN01abc_!!123-0-cib.jpg_400x400.jpg        -> ~82 KB
 *   .../O1CN01abc_!!123-0-cib.jpg_250x250q75.jpg_.webp -> ~8 KB
 *
 * Product grids render these into ~175px thumbnails, so serving the originals — or even
 * the 400x400 JPEG derivative — wastes most of the bytes on the page. Requesting WebP at
 * an explicit quality is worth roughly a 90% saving over the JPEG derivative at the same
 * dimensions, which is the bulk of this page's weight.
 *
 * Two hosts understand the suffix: alicdn.com (any subdomain) and 1688.com's own image
 * CDN (global-img-cdn.1688.com, under /img/). Every other URL is returned untouched.
 */

/** `cbu01.alicdn.com`, `img.alicdn.com`, … — the whole host family serves derivatives. */
const ALICDN_HOST = /^https?:\/\/(?:[a-z0-9-]+\.)?alicdn\.com\//i;
/** 1688's image CDN only serves them under /img/; other 1688.com paths are HTML. */
const IMG_1688_HOST = /^https?:\/\/(?:[a-z0-9-]+\.)?1688\.com\/img\//i;

/** Already-derived URLs end in e.g. `_400x400.jpg` or `_250x250q75.jpg_.webp`. */
const ALREADY_SIZED = /_\d+x\d+(?:q\d+)?\.(?:jpg|jpeg|png|webp)(?:_\.webp)?$/i;

export type ThumbSize = 100 | 200 | 250 | 300 | 400 | 640 | 800;

/**
 * 75 is the CDN's own default-ish quality knob. At thumbnail sizes it is visually
 * indistinguishable from the unqualified derivative and roughly a third of the bytes.
 */
const QUALITY = 75;

/**
 * Returns the trimmed URL when this host understands derivative suffixes and the URL
 * does not already carry one, otherwise null.
 */
function derivableBase(url: string | undefined | null): string | null {
  if (!url) return null;
  const trimmed = String(url).trim();
  if (!ALICDN_HOST.test(trimmed) && !IMG_1688_HOST.test(trimmed)) return null;
  if (ALREADY_SIZED.test(trimmed)) return null;
  // A query string would end up before the suffix and break the path.
  if (trimmed.includes("?")) return null;
  return trimmed;
}

/** `<base>_250x250q75.jpg_.webp` — the CDN's WebP derivative at the requested box. */
function derivative(base: string, size: number): string {
  return `${base}_${size}x${size}q${QUALITY}.jpg_.webp`;
}

/** Same box, but the plain JPEG derivative — the first fallback if WebP 404s. */
function jpegDerivative(base: string, size: number): string {
  return `${base}_${size}x${size}.jpg`;
}

export function cdnImage(url: string | undefined | null, size: ThumbSize): string {
  const base = derivableBase(url);
  if (base === null) return String(url ?? "").trim();
  return derivative(base, size);
}

/**
 * Builds a `srcset` so the browser picks a derivative that matches the rendered box and
 * the device pixel ratio, instead of every viewport paying for the largest one. A 175px
 * grid cell wants ~200px on a desktop DPR-1 screen but ~600px on a DPR-3 phone; a single
 * fixed `cdnImage()` size has to over-serve one of them.
 *
 * Returns undefined for non-CDN URLs so the caller can spread it onto the <img> and have
 * React drop the attribute entirely.
 */
export function cdnSrcSet(
  url: string | undefined | null,
  sizes: readonly ThumbSize[],
): string | undefined {
  const base = derivableBase(url);
  if (base === null) return undefined;
  return sizes.map((size) => `${derivative(base, size)} ${size}w`).join(", ");
}

/**
 * onError handler for images using a `cdnImage()` src. Steps down one rung at a time —
 * WebP derivative, then the JPEG derivative at the same box, then the untouched original,
 * then the placeholder — so an asset the CDN simply has no WebP for costs a re-encode
 * rather than jumping straight back to a 300 KB original.
 */
export function cdnImageFallback(
  originalUrl: string | undefined | null,
  placeholder = "/placeholder.svg",
) {
  return (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const original = String(originalUrl ?? "").trim();

    // React recycles <img> DOM nodes between list items. A plain boolean flag therefore
    // leaked across products, and the next product to fail skipped its original-URL
    // retry and dropped straight to the placeholder. Key the attempt to this specific
    // URL and reset whenever the node is reused for a different image.
    if (img.dataset.cdnFallbackFor !== original) {
      img.dataset.cdnFallbackFor = original;
      img.dataset.cdnFallbackState = "";
    }

    const state = img.dataset.cdnFallbackState;

    // Already showing the placeholder and it still errored — stop, or we loop.
    if (state === "placeholder") return;

    // A srcset outranks src: without clearing it the browser would keep re-picking the
    // failing candidate and every assignment below would be silently ignored.
    img.removeAttribute("srcset");
    img.removeAttribute("sizes");

    // Read the attribute, not the property: `img.src` resolves to an absolute URL, so
    // comparing it against a root-relative placeholder was always unequal and a failing
    // placeholder would re-enter onError forever.
    const currentSrc = img.getAttribute("src") ?? "";

    const base = derivableBase(original);
    if (base && !state) {
      // Recover the box the WebP derivative asked for so the JPEG retry matches it.
      const box = /_(\d+)x\d+q\d+\.jpg_\.webp$/i.exec(currentSrc);
      const jpeg = jpegDerivative(base, box ? Number(box[1]) : 400);
      if (jpeg !== currentSrc) {
        img.dataset.cdnFallbackState = "jpeg";
        img.src = jpeg;
        return;
      }
    }

    if (original && currentSrc !== original && state !== "original") {
      img.dataset.cdnFallbackState = "original";
      img.src = original;
      return;
    }

    img.dataset.cdnFallbackState = "placeholder";
    img.src = placeholder;
  };
}

/**
 * Candidate widths for product thumbnails. The spread covers a ~190px desktop cell at
 * DPR 1 through the same cell on a DPR-3 phone, where the 2-up grid is ~50vw.
 */
export const PRODUCT_THUMB_WIDTHS: readonly ThumbSize[] = [200, 250, 400, 640];

/**
 * Rendered width of one cell in the product grids (2 / 3 / 4 / 5 / 6 columns across the
 * Tailwind breakpoints). Deliberately rounded up a little: over-stating the box costs one
 * candidate step, under-stating it ships a blurry thumbnail.
 */
export const PRODUCT_GRID_SIZES =
  "(min-width: 1280px) 224px, (min-width: 1024px) 20vw, (min-width: 768px) 25vw, (min-width: 640px) 33vw, 50vw";

/** The horizontal category carousels use fixed-width cards rather than a fluid grid. */
export const PRODUCT_CAROUSEL_SIZES = "(min-width: 640px) 180px, 160px";
