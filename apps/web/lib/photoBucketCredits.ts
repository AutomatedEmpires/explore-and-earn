/**
 * Photo-bucket attribution — Unsplash source credits for seeded imagery.
 * ---------------------------------------------------------------------------
 * The Unsplash License does NOT require attribution, but we keep it: cheap
 * goodwill and it seeds a future /credits page.
 *
 * The list is EMPTY because the photo buckets are empty. The previously seeded
 * imagery was served by an image CDN this product no longer uses, and every one
 * of those objects is gone — crediting a photographer for a photo we do not
 * show would be a claim with nothing behind it, exactly the class of thing this
 * codebase refuses elsewhere. The module keeps its shape so the seeder has a
 * mirror target: `scripts/seed-site-photos.mjs` writes a manifest alongside the
 * uploads, and its rows are pasted back in here when a bucket is populated
 * (see docs/design/site-photos.md).
 */

export interface PhotoCredit {
	/** Object path inside the public `site-photos` storage bucket. */
	readonly path: string;
	readonly photographer: string;
	readonly photographerUrl: string;
	readonly unsplashUrl: string;
	readonly source: "unsplash";
}

export const PHOTO_BUCKET_CREDITS: readonly PhotoCredit[] = [];

/** Credit for a bucket object path, or null when none is recorded. */
export function creditFor(path: string): PhotoCredit | null {
	return PHOTO_BUCKET_CREDITS.find((c) => c.path === path) ?? null;
}
