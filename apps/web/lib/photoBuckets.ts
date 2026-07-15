/**
 * PHOTO BUCKET SYSTEM — the nine app-managed photo buckets.
 * ─────────────────────────────────────────────────────────────────────────────
 * Every surface that lets a user pick a predefined image (rather than uploading
 * their own) draws from one of the NINE buckets defined here. This file is the
 * single source of truth: a typed, ordered list of Cloudinary public IDs per
 * bucket, editable in ONE place (or from the admin Photo Buckets manager).
 *
 * ── CLOUDINARY FOLDER CONVENTION ─────────────────────────────────────────────
 * The founder uploads real photos into a documented, per-bucket folder so the
 * library stays organized and each bucket maps 1:1 to a Cloudinary folder:
 *
 *     ee/buckets/{bucket}/{slug}                      (flat buckets)
 *     ee/buckets/{bucket}/{category}/{slug}           (category-partitioned buckets)
 *
 * where {bucket} is the BucketId (e.g. `hostCover`, `housing`) and {category} is
 * the sub-bucket key (e.g. `farm`, `bedrooms`). Examples:
 *
 *     ee/buckets/homepageCover/coast-sunrise
 *     ee/buckets/hostProfile/maritime/harbor-dawn
 *     ee/buckets/housing/bedrooms/bunkroom-01
 *     ee/buckets/meals/dining/mess-hall-01
 *
 * A bucket ENTRY holds the FULL Cloudinary public ID in `publicId`. Seeded
 * entries currently reference the EXISTING curated library at
 * `explore-and-earn/photos/{category}/landscape/{slug}` (the real IDs already in
 * curatedPhotos.ts) so nothing looks empty on day one. As the founder uploads
 * into `ee/buckets/…`, swap the seeded publicId (or add entries) to the new IDs.
 *
 * ── LAWS ─────────────────────────────────────────────────────────────────────
 *  - NEVER fabricate a URL. An entry with no real image yet has `publicId: null`
 *    (a reserved "to populate" slot) — it renders as an empty placeholder, never
 *    a fake photo. Only real, uploaded IDs get a non-null publicId.
 *  - Covers are ALWAYS separate from logos/icons; the three scopes (seeker /
 *    host / admin) keep DISTINCT buckets.
 *  - Uploading your own is always the PRIMARY path; bucket-pick is the fallback
 *    (see BucketPhotoPicker).
 */

import { type PhotoSize } from "@explore-and-earn/ui";

// ── URL resolution ────────────────────────────────────────────────────────────

// Matches the cloud the curated library is delivered from (see cloudinary.ts),
// overridable via env without diverging from the seeded real IDs.
const CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "dwiwyt9vi";

/**
 * Delivery URL for a bucket entry's Cloudinary public ID at a named size.
 * Public IDs are stored raw (folder + slug); this applies the `t_ee-{size}`
 * named transformation, exactly like `cloudinaryPhoto`.
 */
export function bucketPhotoUrl(publicId: string, size: PhotoSize = "card"): string {
	return `https://res.cloudinary.com/${CLOUD}/image/upload/t_ee-${size}/${publicId}`;
}

/** Full public ID for a photo in the EXISTING curated library (seed source). */
function curatedId(
	category: "farm" | "maritime" | "remote" | "seasonal",
	slug: string,
): string {
	return `explore-and-earn/photos/${category}/landscape/${slug}`;
}

/** The documented upload folder for a bucket (+ optional category). */
export function bucketFolder(bucket: BucketId, category?: string): string {
	return category ? `ee/buckets/${bucket}/${category}` : `ee/buckets/${bucket}`;
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
 * One ordered slot in a bucket.
 *  - `publicId` non-null → a real Cloudinary image (seeded or founder-uploaded).
 *  - `publicId` null     → a reserved "to populate" slot (empty placeholder,
 *                          NEVER a fabricated URL).
 */
export interface BucketEntry {
	readonly id: string;
	readonly label: string;
	readonly publicId: string | null;
}

/**
 * A section of a bucket. Flat buckets have a single "default" section; the three
 * category-partitioned buckets (hostProfile, housing, meals) have one section
 * per predefined category — these MIRROR the housing/meals popup categories.
 */
export interface BucketSection {
	readonly key: string;
	readonly label: string;
	/** Sub-folder under the bucket, i.e. ee/buckets/{bucket}/{folderKey}. */
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

/** A seeded entry pointing at a REAL existing curated public ID. */
const seed = (
	id: string,
	label: string,
	category: "farm" | "maritime" | "remote" | "seasonal",
	slug: string,
): BucketEntry => ({ id, label, publicId: curatedId(category, slug) });

/** A reserved slot the founder still needs to populate (no fabricated URL). */
const todo = (id: string, label: string): BucketEntry => ({
	id,
	label,
	publicId: null,
});

/**
 * A REAL, uploaded bucket photo whose public ID lives under `ee/buckets/…`
 * (seeded via scripts/seed-photo-buckets.mjs → Cloudinary). Distinct from
 * `seed()`, which points back at the older curated library.
 */
const real = (id: string, label: string, publicId: string): BucketEntry => ({
	id,
	label,
	publicId,
});

const flat = (entries: readonly BucketEntry[]): readonly BucketSection[] => [
	{ key: "default", label: "All", folderKey: null, entries },
];

// ── The NINE buckets ──────────────────────────────────────────────────────────

/**
 * NOTE ON SEEDING: cover buckets reference the older curated library via
 * `seed()`. Housing + meals now carry a first batch of REAL uploads under
 * `ee/buckets/…` (via `real()`, from scripts/seed-photo-buckets.mjs — Unsplash,
 * people-safe: zero detected faces, delivery-verified through t_ee-*). A few
 * thin sections keep a `todo()` slot for expansion. Seeker icons + admin imagery
 * stay `todo()` (identity buckets are intentionally NOT photo-seeded — no model
 * release; they use the abstract monogram/gradient fallback).
 */
export const PHOTO_BUCKETS: Record<BucketId, PhotoBucket> = {
	// 1 ── Homepage hero — rotates per landing (see design rules). Landscape mix.
	homepageCover: {
		id: "homepageCover",
		label: "Homepage cover",
		description:
			"Rotating homepage hero. A landscape mix across the four categories.",
		partitioned: false,
		sections: flat([
			seed("home-fields", "Golden fields", "seasonal", "yuhan-du-zi9z-e8cxge"),
			seed("home-coast", "Open coast", "seasonal", "vincent-guth-62v7ntlkgl8"),
			seed("home-harbor", "Harbor", "maritime", "rasmus-andersen-nmzzl8lzkuu"),
			seed("home-farm", "Working farm", "farm", "annie-spratt-jmjnnq2xfoy"),
			seed("home-trail", "Remote trail", "remote", "kevin-schmid-mta8r0bxhbo"),
			todo("home-04", "To populate"),
		]),
	},

	// 2 ── Host public-profile COVER (separate from the host logo).
	hostCover: {
		id: "hostCover",
		label: "Host cover",
		description: "Host public-profile cover band — the working landscape.",
		partitioned: false,
		sections: flat([
			seed("host-farm", "Working farm", "farm", "annie-spratt-jmjnnq2xfoy"),
			seed("host-orchard", "Orchard rows", "farm", "sokmean-nou-mjeqdrpwefc"),
			seed("host-harbor", "Harbor", "maritime", "rasmus-andersen-nmzzl8lzkuu"),
			seed("host-vessel", "On the water", "maritime", "venti-views-asmavys4azm"),
			todo("host-cover-05", "To populate"),
			todo("host-cover-06", "To populate"),
		]),
	},

	// 3 ── Host PROFILE imagery, partitioned by host type (four categories).
	hostProfile: {
		id: "hostProfile",
		label: "Host profile",
		description:
			"Host-type imagery for the profile showcase — one set per category.",
		partitioned: true,
		sections: [
			{
				key: "farm",
				label: "Farm",
				folderKey: "farm",
				entries: [
					seed("hp-farm-1", "Working farm", "farm", "annie-spratt-jmjnnq2xfoy"),
					seed("hp-farm-2", "Orchard rows", "farm", "sokmean-nou-mjeqdrpwefc"),
					todo("hp-farm-3", "To populate"),
				],
			},
			{
				key: "maritime",
				label: "Maritime",
				folderKey: "maritime",
				entries: [
					seed("hp-mar-1", "Harbor", "maritime", "rasmus-andersen-nmzzl8lzkuu"),
					seed("hp-mar-2", "On the water", "maritime", "venti-views-asmavys4azm"),
					todo("hp-mar-3", "To populate"),
				],
			},
			{
				key: "remote",
				label: "Remote",
				folderKey: "remote",
				entries: [
					seed("hp-rem-1", "Remote trail", "remote", "kevin-schmid-mta8r0bxhbo"),
					todo("hp-rem-2", "To populate"),
					todo("hp-rem-3", "To populate"),
				],
			},
			{
				key: "seasonal",
				label: "Seasonal",
				folderKey: "seasonal",
				entries: [
					seed("hp-sea-1", "Golden fields", "seasonal", "yuhan-du-zi9z-e8cxge"),
					seed("hp-sea-2", "Open coast", "seasonal", "vincent-guth-62v7ntlkgl8"),
					todo("hp-sea-3", "To populate"),
				],
			},
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
			{
				key: "meals",
				label: "Prepared meals",
				folderKey: "meals",
				entries: [
					real("meal-meals-ella-olsson", "Prepared meal", "ee/buckets/meals/meals/ella-olsson-ZjEeMnDiq00"),
					todo("meal-meals-2", "To populate"),
				],
			},
			{
				key: "kitchens",
				label: "Kitchens",
				folderKey: "kitchens",
				entries: [
					real("meal-kit-zhang-ziyu", "Kitchen", "ee/buckets/meals/kitchens/zhang-ziyu-2VX0f47Z5NA"),
					real("meal-kit-luk-parnican", "Farmhouse kitchen", "ee/buckets/meals/kitchens/luk-parni-an-HZgSvndfakc"),
				],
			},
			{
				key: "dining",
				label: "Dining",
				folderKey: "dining",
				entries: [
					real("meal-din-bruno-ngarukiye", "Dining table", "ee/buckets/meals/dining/bruno-ngarukiye-OqFZPMeufYQ"),
					todo("meal-din-2", "To populate"),
				],
			},
			{
				key: "misc",
				label: "Misc",
				folderKey: "misc",
				entries: [
					real("meal-misc-vije", "Fresh produce", "ee/buckets/meals/misc/vije-vijendranath-26LFdL8exMo"),
				],
			},
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
			{
				key: "bedrooms",
				label: "Bedrooms",
				folderKey: "bedrooms",
				entries: [
					real("house-bed-marcus-loke", "Bunk room", "ee/buckets/housing/bedrooms/marcus-loke-WQJvWU_HZFo"),
					real("house-bed-zoshua-colah", "Simple bedroom", "ee/buckets/housing/bedrooms/zoshua-colah-TzMGehZmocI"),
				],
			},
			{
				key: "bathrooms",
				label: "Bathrooms",
				folderKey: "bathrooms",
				entries: [
					real("house-bath-carlos-masias", "Shared bathroom", "ee/buckets/housing/bathrooms/carlos-masias-yg8zkwBS30Q"),
					real("house-bath-steven-ungermann", "Washroom", "ee/buckets/housing/bathrooms/steven-ungermann-Aac7IlKnYX8"),
				],
			},
			{
				key: "exteriors",
				label: "Exteriors",
				folderKey: "exteriors",
				entries: [
					real("house-ext-troy-mortier", "Lodge exterior", "ee/buckets/housing/exteriors/troy-mortier-AmGQi4pF_lE"),
					real("house-ext-dmytro-koplyk", "Housing exterior", "ee/buckets/housing/exteriors/dmytro-koplyk-8xAu_SSpMPQ"),
				],
			},
			{
				key: "misc",
				label: "Misc",
				folderKey: "misc",
				entries: [todo("house-misc-1", "To populate")],
			},
		],
	},

	// 6 ── Seeker profile COVER (separate from the seeker icon/avatar).
	seekerCover: {
		id: "seekerCover",
		label: "Seeker cover",
		description: "Seeker profile cover — aspirational, on-the-move landscapes.",
		partitioned: false,
		sections: flat([
			seed("seeker-fields", "Golden fields", "seasonal", "yuhan-du-zi9z-e8cxge"),
			seed("seeker-coast", "Open coast", "seasonal", "vincent-guth-62v7ntlkgl8"),
			seed("seeker-trail", "Remote trail", "remote", "kevin-schmid-mta8r0bxhbo"),
			todo("seeker-cover-04", "To populate"),
		]),
	},

	// 7 ── Seeker ICON/avatar. No curated icon photography exists yet; the
	// abstract monogram fallback lives in curatedPhotos.curatedLogos("seeker").
	seekerIcon: {
		id: "seekerIcon",
		label: "Seeker icon",
		description:
			"Seeker avatar/icon photos. No curated photography yet — abstract monogram tiles (curatedLogos) are the fallback until populated.",
		partitioned: false,
		sections: flat([
			todo("seeker-icon-1", "To populate"),
			todo("seeker-icon-2", "To populate"),
		]),
	},

	// 8 ── Admin COVER. Brand-neutral chrome; gradient covers (curatedCovers
	// "admin") are the fallback until any photography is uploaded.
	adminCover: {
		id: "adminCover",
		label: "Admin cover",
		description:
			"Admin surface cover. Calm, brand-neutral — gradient covers (curatedCovers) are the fallback until populated.",
		partitioned: false,
		sections: flat([
			todo("admin-cover-1", "To populate"),
			todo("admin-cover-2", "To populate"),
		]),
	},

	// 9 ── Admin PROFILE icon. Neutral system marks (curatedLogos "admin") are
	// the fallback until populated.
	adminProfile: {
		id: "adminProfile",
		label: "Admin profile",
		description:
			"Admin profile icon photos. Neutral system marks (curatedLogos) are the fallback until populated.",
		partitioned: false,
		sections: flat([todo("admin-profile-1", "To populate")]),
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
 * Flattened, real (non-null) entries of a bucket — what a picker offers as
 * ready-to-choose options. "To populate" slots are omitted so a chooser never
 * shows an empty tile as if it were selectable.
 */
export interface ResolvedBucketPhoto {
	readonly id: string;
	readonly label: string;
	readonly publicId: string;
	readonly section: string;
}

export function bucketPhotos(id: BucketId): readonly ResolvedBucketPhoto[] {
	const bucket = PHOTO_BUCKETS[id];
	const out: ResolvedBucketPhoto[] = [];
	for (const section of bucket.sections) {
		for (const entry of section.entries) {
			if (entry.publicId) {
				out.push({
					id: entry.id,
					label: entry.label,
					publicId: entry.publicId,
					section: section.label,
				});
			}
		}
	}
	return out;
}

/** Count of populated vs reserved slots — surfaced in the admin manager. */
export function bucketFill(id: BucketId): { readonly filled: number; readonly total: number } {
	const bucket = PHOTO_BUCKETS[id];
	let filled = 0;
	let total = 0;
	for (const section of bucket.sections) {
		for (const entry of section.entries) {
			total += 1;
			if (entry.publicId) filled += 1;
		}
	}
	return { filled, total };
}

// Cross-check: curatedPhotos.ts remains the fallback source for gradient covers
// and abstract monogram logos referenced in several bucket descriptions above.
// Keep this file the source of truth for PHOTO buckets; keep curatedPhotos the
// source of truth for gradient/monogram fallbacks.
