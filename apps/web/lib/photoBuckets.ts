/**
 * PHOTO BUCKET SYSTEM — the nine app-managed photo buckets.
 * ─────────────────────────────────────────────────────────────────────────────
 * Every surface that lets a user pick a predefined image (rather than uploading
 * their own) draws from one of the NINE buckets defined here. This file is the
 * single source of truth: a typed, ordered list of storage object paths per
 * bucket, editable in ONE place (and readable from the admin Photo Buckets
 * manager).
 *
 * ── STORAGE LAYOUT ───────────────────────────────────────────────────────────
 * Bucket photos live in the PUBLIC Supabase Storage bucket `site-photos`, in a
 * documented per-bucket folder so each app bucket maps 1:1 to a storage folder:
 *
 *     buckets/{bucket}/{slug}                      (flat buckets)
 *     buckets/{bucket}/{category}/{slug}           (category-partitioned buckets)
 *
 * where {bucket} is the BucketId (e.g. `hostCover`, `housing`) and {category} is
 * the sub-bucket key (e.g. `farm`, `bedrooms`). Examples:
 *
 *     buckets/homepageCover/coast-sunrise
 *     buckets/hostProfile/maritime/harbor-dawn
 *     buckets/housing/bedrooms/bunkroom-01
 *     buckets/meals/dining/mess-hall-01
 *
 * A bucket ENTRY holds the object path (relative to the bucket root) in `path`.
 *
 * ── CURRENT STATE: EVERY BUCKET IS EMPTY, ON PURPOSE ─────────────────────────
 * These buckets were previously seeded from a curated stock library delivered by
 * an image CDN this product no longer uses. That library is gone, and we hold no
 * replacement photography — so rather than repoint the old public IDs at storage
 * objects that do not exist (a fabricated URL by any other name), the seeded
 * entries were REMOVED along with the reserved "to populate" slots. A bucket
 * with nothing in it renders its honest empty state: the pickers show only the
 * upload path, and the admin manager reports 0 photos.
 *
 * To populate a bucket: run `node scripts/seed-site-photos.mjs` (Unsplash →
 * `site-photos`, needs UNSPLASH_ACCESS_KEY), review the generated fragment, then
 * paste the entries into the relevant `entries: []` below. See
 * docs/design/site-photos.md.
 *
 * ── LAWS ─────────────────────────────────────────────────────────────────────
 *  - NEVER fabricate a URL. An entry exists ONLY when a real object exists at
 *    that path in `site-photos`. There are no placeholder or reserved entries.
 *  - Covers are ALWAYS separate from logos/icons; the three scopes (seeker /
 *    host / admin) keep DISTINCT buckets.
 *  - Uploading your own is always the PRIMARY path; bucket-pick is the fallback
 *    (see BucketPhotoPicker).
 */

// ── URL resolution ────────────────────────────────────────────────────────────

/** The public Supabase Storage bucket that holds app-managed site photography. */
export const SITE_PHOTOS_BUCKET = "site-photos";

/**
 * Named delivery sizes. These map onto Supabase Storage's image transformation
 * endpoint (`/storage/v1/render/image/public/...`), which is a Pro-plan feature;
 * `full` is served as the original object so the system still delivers something
 * real on a plan without transformations.
 */
export type PhotoSize = "thumb" | "card" | "hero" | "full" | "og" | "sq-sm" | "sq-md";

interface SizeSpec {
	readonly width: number;
	readonly height?: number;
}

/** Pixel budget per named size (mirrors the sizes the surfaces actually request). */
const SIZE_SPECS: Record<Exclude<PhotoSize, "full">, SizeSpec> = {
	thumb: { width: 320 },
	card: { width: 640 },
	hero: { width: 1280 },
	og: { width: 1200, height: 630 },
	"sq-sm": { width: 320, height: 320 },
	"sq-md": { width: 640, height: 640 },
};

const RENDER_QUALITY = 80;

function storageOrigin(): string {
	return (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
}

/**
 * Public delivery URL for a bucket entry's object path at a named size.
 *
 * `full` (and anything unmapped) resolves to the raw public object; every other
 * size resolves through the render/image endpoint with an explicit width/height
 * and `resize=cover`, which is the direct translation of the old named
 * transformations. Returns "" when NEXT_PUBLIC_SUPABASE_URL is unset, so a
 * misconfigured environment renders nothing rather than a broken host.
 */
export function bucketPhotoUrl(path: string, size: PhotoSize = "card"): string {
	const origin = storageOrigin();
	if (!origin) return "";
	const object = path.replace(/^\/+/, "");
	if (size === "full") {
		return `${origin}/storage/v1/object/public/${SITE_PHOTOS_BUCKET}/${object}`;
	}
	const spec = SIZE_SPECS[size];
	const params = new URLSearchParams({ width: String(spec.width) });
	if (spec.height) params.set("height", String(spec.height));
	params.set("resize", "cover");
	params.set("quality", String(RENDER_QUALITY));
	return `${origin}/storage/v1/render/image/public/${SITE_PHOTOS_BUCKET}/${object}?${params.toString()}`;
}

/** The documented storage folder for a bucket (+ optional category). */
export function bucketFolder(bucket: BucketId, category?: string): string {
	return category ? `buckets/${bucket}/${category}` : `buckets/${bucket}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type BucketId =
	| "homepageCover"
	| "hostCover"
	| "hostProfile"
	| "meals"
	| "housing"
	| "seekerCover"
	| "seekerIcon"
	| "adminCover"
	| "adminProfile";

/**
 * One ordered slot in a bucket. `path` is the object path inside `site-photos`
 * and is ALWAYS a real, uploaded object — there is no null/placeholder variant.
 */
export interface BucketEntry {
	readonly id: string;
	readonly label: string;
	readonly path: string;
}

/**
 * A section of a bucket. Flat buckets have a single "default" section; the three
 * category-partitioned buckets (hostProfile, housing, meals) have one section
 * per predefined category — these MIRROR the housing/meals popup categories.
 */
export interface BucketSection {
	readonly key: string;
	readonly label: string;
	/** Sub-folder under the bucket, i.e. buckets/{bucket}/{folderKey}. */
	readonly folderKey: string | null;
	readonly entries: readonly BucketEntry[];
}

export interface PhotoBucket {
	readonly id: BucketId;
	readonly label: string;
	readonly description: string;
	/** True when the bucket is split into predefined categories. */
	readonly partitioned: boolean;
	readonly sections: readonly BucketSection[];
}

// ── Entry helpers ───────────────────────────────────────────────────────────

const flat = (entries: readonly BucketEntry[]): readonly BucketSection[] => [
	{ key: "default", label: "All", folderKey: null, entries },
];

// ── The NINE buckets ──────────────────────────────────────────────────────────

export const PHOTO_BUCKETS: Record<BucketId, PhotoBucket> = {
	// 1 ── Homepage hero — rotates per landing (see design rules). Landscape mix.
	homepageCover: {
		id: "homepageCover",
		label: "Homepage cover",
		description:
			"Rotating homepage hero. A landscape mix across the four categories. Empty — the homepage hero currently paints the lane cover gradient.",
		partitioned: false,
		sections: flat([]),
	},

	// 2 ── Host public-profile COVER (separate from the host logo).
	hostCover: {
		id: "hostCover",
		label: "Host cover",
		description:
			"Host public-profile cover band — the working landscape. Empty — gradient covers (curatedCovers) are the fallback until populated.",
		partitioned: false,
		sections: flat([]),
	},

	// 3 ── Host PROFILE imagery, partitioned by host type (four categories).
	hostProfile: {
		id: "hostProfile",
		label: "Host profile",
		description:
			"Host-type imagery for the profile showcase — one set per category.",
		partitioned: true,
		sections: [
			{ key: "farm", label: "Farm", folderKey: "farm", entries: [] },
			{ key: "maritime", label: "Maritime", folderKey: "maritime", entries: [] },
			{ key: "remote", label: "Remote", folderKey: "remote", entries: [] },
			{ key: "seasonal", label: "Seasonal", folderKey: "seasonal", entries: [] },
		],
	},

	// 4 ── MEALS evidence bucket — mirrors the meals popup slot categories.
	meals: {
		id: "meals",
		label: "Meals",
		description:
			"Meal evidence photos. Categories mirror the meals popup (meals · kitchens · dining · misc).",
		partitioned: true,
		sections: [
			{ key: "meals", label: "Prepared meals", folderKey: "meals", entries: [] },
			{ key: "kitchens", label: "Kitchens", folderKey: "kitchens", entries: [] },
			{ key: "dining", label: "Dining", folderKey: "dining", entries: [] },
			{ key: "misc", label: "Misc", folderKey: "misc", entries: [] },
		],
	},

	// 5 ── HOUSING evidence bucket — mirrors the housing popup slot categories.
	housing: {
		id: "housing",
		label: "Housing",
		description:
			"Housing evidence photos. Categories mirror the housing popup (bedrooms · bathrooms · exteriors · misc).",
		partitioned: true,
		sections: [
			{ key: "bedrooms", label: "Bedrooms", folderKey: "bedrooms", entries: [] },
			{ key: "bathrooms", label: "Bathrooms", folderKey: "bathrooms", entries: [] },
			{ key: "exteriors", label: "Exteriors", folderKey: "exteriors", entries: [] },
			{ key: "misc", label: "Misc", folderKey: "misc", entries: [] },
		],
	},

	// 6 ── Seeker profile COVER (separate from the seeker icon/avatar).
	seekerCover: {
		id: "seekerCover",
		label: "Seeker cover",
		description:
			"Seeker profile cover — aspirational, on-the-move landscapes. Empty — gradient covers (curatedCovers) are the fallback until populated.",
		partitioned: false,
		sections: flat([]),
	},

	// 7 ── Seeker ICON/avatar. No curated icon photography exists; the abstract
	// monogram fallback lives in curatedPhotos.curatedLogos("seeker").
	seekerIcon: {
		id: "seekerIcon",
		label: "Seeker icon",
		description:
			"Seeker avatar/icon photos. Deliberately never stock-seeded — a stock face has no model release, so presenting one as a person's identity would misrepresent a real human. Abstract monogram tiles (curatedLogos) are the fallback.",
		partitioned: false,
		sections: flat([]),
	},

	// 8 ── Admin COVER. Brand-neutral chrome; gradient covers (curatedCovers
	// "admin") are the fallback.
	adminCover: {
		id: "adminCover",
		label: "Admin cover",
		description:
			"Admin surface cover. Calm, brand-neutral — gradient covers (curatedCovers) are the fallback by design; no photography is planned.",
		partitioned: false,
		sections: flat([]),
	},

	// 9 ── Admin PROFILE icon. Neutral system marks (curatedLogos "admin") are
	// the fallback.
	adminProfile: {
		id: "adminProfile",
		label: "Admin profile",
		description:
			"Admin profile icon photos. Never stock-seeded (no model release). Neutral system marks (curatedLogos) are the fallback.",
		partitioned: false,
		sections: flat([]),
	},
};

// ── Ordered list + accessors ──────────────────────────────────────────────────

export const BUCKET_ORDER: readonly BucketId[] = [
	"homepageCover",
	"hostCover",
	"hostProfile",
	"housing",
	"meals",
	"seekerCover",
	"seekerIcon",
	"adminCover",
	"adminProfile",
];

/** Every bucket, in a stable display order (for the admin manager). */
export function allBuckets(): readonly PhotoBucket[] {
	return BUCKET_ORDER.map((id) => PHOTO_BUCKETS[id]);
}

/** One bucket by id. */
export function getBucket(id: BucketId): PhotoBucket {
	return PHOTO_BUCKETS[id];
}

/**
 * Flattened entries of a bucket — what a picker offers as ready-to-choose
 * options. Every entry is a real object, so this is simply the flattening; an
 * empty result means the bucket has no photos and the picker must say so.
 */
export interface ResolvedBucketPhoto {
	readonly id: string;
	readonly label: string;
	readonly path: string;
	readonly section: string;
}

export function bucketPhotos(id: BucketId): readonly ResolvedBucketPhoto[] {
	const bucket = PHOTO_BUCKETS[id];
	const out: ResolvedBucketPhoto[] = [];
	for (const section of bucket.sections) {
		for (const entry of section.entries) {
			out.push({
				id: entry.id,
				label: entry.label,
				path: entry.path,
				section: section.label,
			});
		}
	}
	return out;
}

/** How many photos a bucket holds — surfaced in the admin manager. */
export function bucketFill(id: BucketId): { readonly filled: number } {
	let filled = 0;
	for (const section of PHOTO_BUCKETS[id].sections) {
		filled += section.entries.length;
	}
	return { filled };
}

// Cross-check: curatedPhotos.ts remains the fallback source for gradient covers
// and abstract monogram logos referenced in several bucket descriptions above.
// Keep this file the source of truth for PHOTO buckets; keep curatedPhotos the
// source of truth for gradient/monogram fallbacks.
