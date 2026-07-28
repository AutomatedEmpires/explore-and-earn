import manifest from "../public/photos/manifest.json";

/**
 * Site photography catalog — the typed read side of
 * apps/web/public/photos/manifest.json.
 *
 * The manifest is WRITTEN by the acquisition scripts (scripts/
 * fetch-unsplash-photos.mjs primary, scripts/fetch-commons-photos.mjs
 * fallback) and read here. Nothing in the app hand-writes an entry: an entry
 * exists only when the two rendition files really exist on disk beside it,
 * which tests/unit/site-photo-manifest.test.ts asserts against the shipped
 * bytes.
 *
 * Every photo carries the attribution needed to render /credits. That page is
 * how the CC-BY / CC-BY-SA attribution condition is satisfied, and how the
 * Unsplash API guideline on photographer credit is honoured.
 *
 * HONESTY RULE: no caption, alt text, or surrounding copy may present a person
 * in these photographs as an Explore & Earn host, worker, staff member, or
 * named individual. Alt text describes the scene only.
 */

/** Shot-list buckets the acquisition scripts fill. */
export type SitePhotoCategory =
  | "lake"
  | "lodge"
  | "paddle"
  | "dock"
  | "trail"
  | "kitchen"
  | "crew"
  | "idaho";

/** The two renditions every asset ships. */
export type SitePhotoSize = "hero" | "card";

export interface SitePhotoRendition {
  readonly src: string;
  readonly width: number;
  readonly height: number;
}

export interface SitePhoto {
  readonly slug: string;
  readonly category: SitePhotoCategory;
  /** Real descriptive alt text, written by a human who looked at the image. */
  readonly alt: string;
  /** Intrinsic dimensions of the hero rendition. */
  readonly width: number;
  readonly height: number;
  readonly sizes: Readonly<Record<SitePhotoSize, SitePhotoRendition>>;
  readonly author: string;
  readonly authorUrl: string;
  readonly license: string;
  readonly licenseUrl: string;
  readonly sourceUrl: string;
  /** Provider name, e.g. "Unsplash" or "Wikimedia Commons". */
  readonly source: string;
  /** Provider-side identifier (Unsplash photo id / Commons file title). */
  readonly sourceRef: string;
  readonly retrievedAt: string;
}

/**
 * The ONLY licences allowed to ship. Widening this list is a licensing
 * decision, not a refactor — the manifest-integrity test fails on anything
 * outside it.
 */
export const SITE_PHOTO_LICENSE_ALLOWLIST: readonly RegExp[] = [
  /^CC0$/,
  /^Public domain$/,
  /^CC BY \d(\.\d)?$/,
  /^CC BY-SA \d(\.\d)?$/,
  /^Unsplash License$/,
];

export function isAllowedSitePhotoLicense(license: string): boolean {
  return SITE_PHOTO_LICENSE_ALLOWLIST.some((re) => re.test(license));
}

export const SITE_PHOTOS: readonly SitePhoto[] = manifest.photos as readonly SitePhoto[];

const BY_SLUG: ReadonlyMap<string, SitePhoto> = new Map(
  SITE_PHOTOS.map((photo) => [photo.slug, photo]),
);

/** Look up a photo, or undefined when the slug is not in the catalog. */
export function findSitePhoto(slug: string): SitePhoto | undefined {
  return BY_SLUG.get(slug);
}

/**
 * Look up a photo, throwing when the slug is unknown.
 *
 * Deliberately loud: these are server-rendered marketing surfaces, so a typo
 * surfaces at prerender rather than shipping a silent hole where a photograph
 * was supposed to be.
 */
export function getSitePhoto(slug: string): SitePhoto {
  const photo = BY_SLUG.get(slug);
  if (!photo) {
    throw new Error(
      `Unknown site photo slug "${slug}". Known slugs: ${SITE_PHOTOS.map((p) => p.slug).join(", ")}`,
    );
  }
  return photo;
}

/** Every photo in one shot-list bucket, in manifest (slug) order. */
export function sitePhotosByCategory(
  category: SitePhotoCategory,
): readonly SitePhoto[] {
  return SITE_PHOTOS.filter((photo) => photo.category === category);
}

/** Distinct providers present in the catalog, for the credits page grouping. */
export function sitePhotoSources(): readonly string[] {
  return [...new Set(SITE_PHOTOS.map((photo) => photo.source))].sort();
}
