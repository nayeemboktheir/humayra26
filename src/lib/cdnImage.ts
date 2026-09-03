/**
 * Alibaba's image CDN serves resized/reencoded derivatives when a size suffix is
 * appended to the path, e.g.
 *   .../O1CN01abc_!!123-0-cib.jpg      -> ~800x800 original, often 100-300 KB
 *   .../O1CN01abc_!!123-0-cib.jpg_400x400.jpg
 *
 * Product grids render these into ~150px thumbnails, so serving the originals wastes
 * most of the bytes on the page. Only alicdn hosts understand the suffix; every other
 * URL is returned untouched.
 */

const ALICDN_HOST = /^https?:\/\/(?:[a-z0-9-]+\.)?(?:alicdn\.com|cbu01\.alicdn\.com)/i;

/** Already-sized URLs end in e.g. `_400x400.jpg`; don't stack a second suffix. */
const ALREADY_SIZED = /_\d+x\d+(?:q\d+)?\.(?:jpg|jpeg|png|webp)$/i;

export type ThumbSize = 100 | 200 | 250 | 300 | 400 | 640 | 800;

export function cdnImage(url: string | undefined | null, size: ThumbSize): string {
  if (!url) return "";
  const trimmed = String(url).trim();
  if (!ALICDN_HOST.test(trimmed)) return trimmed;
  if (ALREADY_SIZED.test(trimmed)) return trimmed;
  // Query strings would end up before the suffix and break the path.
  if (trimmed.includes("?")) return trimmed;
  return `${trimmed}_${size}x${size}.jpg`;
}

/**
 * onError handler for images using a `cdnImage()` src: retry the untouched original
 * once before giving up, so a derivative the CDN happens not to have never turns into
 * a missing product image.
 */
export function cdnImageFallback(
  originalUrl: string | undefined | null,
  placeholder = "/placeholder.svg",
) {
  return (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const original = String(originalUrl ?? "").trim();
    if (original && img.src !== original && !img.dataset.triedOriginal) {
      img.dataset.triedOriginal = "1";
      img.src = original;
      return;
    }
    if (img.src !== placeholder) img.src = placeholder;
  };
}
