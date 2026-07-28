import Image from "next/image";

import { getSitePhoto, type SitePhotoSize } from "../../lib/sitePhotos";

/**
 * SitePhoto — the one way app-managed site photography is rendered.
 *
 * A thin wrapper over next/image that reads the catalog
 * (apps/web/lib/sitePhotos.ts) so a caller names a SLUG and gets the correct
 * intrinsic dimensions, the human-written alt text, and the right rendition
 * without hand-copying any of it. next/image serves the WebP directly — the
 * assets are already WebP, so there is no format negotiation to do and no
 * JPEG fallback to ship.
 *
 * Lazy by default. Pass `priority` for a photograph that is genuinely
 * above the fold (a page hero) — that opts into eager loading and a high
 * fetch priority, and should be used for at most one image per screen.
 *
 * NOTHING migrates to this component in the PR that introduces it; later
 * redesign phases consume it.
 *
 * ── ALT TEXT ─────────────────────────────────────────────────────────────────
 * Alt comes from the catalog and describes the SCENE. `alt` may be overridden
 * for a specific context, but an override must still describe what is in the
 * frame — it must never present a person in the photograph as a host, worker,
 * staff member, or named individual of this product. Pass `decorative` when
 * the image is purely ornamental and adjacent text already carries the
 * meaning; that renders alt="" so screen readers skip it.
 */
export interface SitePhotoProps {
  /** Catalog slug, e.g. "cda-lake-01". Unknown slugs throw at render. */
  slug: string;
  /** Which rendition to request. "card" (800w) is the default. */
  size?: SitePhotoSize;
  /** Eager-load + high fetch priority. Use for a real above-the-fold hero. */
  priority?: boolean;
  /** Marks the image as ornamental: renders alt="". */
  decorative?: boolean;
  /** Context-specific alt override. Still describes the scene. */
  alt?: string;
  className?: string;
  /** Responsive `sizes` hint passed straight through to next/image. */
  sizes?: string;
}

export function SitePhoto({
  slug,
  size = "card",
  priority = false,
  decorative = false,
  alt,
  className,
  sizes,
}: SitePhotoProps) {
  const photo = getSitePhoto(slug);
  const rendition = photo.sizes[size];

  return (
    <Image
      src={rendition.src}
      alt={decorative ? "" : (alt ?? photo.alt)}
      width={rendition.width}
      height={rendition.height}
      className={className}
      sizes={sizes}
      priority={priority}
      loading={priority ? "eager" : "lazy"}
    />
  );
}
