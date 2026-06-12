/**
 * Media & photo contracts for Explore&Earn.
 *
 * Source of truth (Notion):
 *  - "Curated Photo Library (Photo Buckets) — V1"
 *  - "Icon & Illustration Manifest — V1" (frame-not-filter)
 *  - "Exact Data Dictionary" (final column placement — reconcile in Database V1)
 * Mirrored doctrine: docs/design/media-buckets.md
 *
 * SPRINT ZERO SCOPE: type-level contracts + locked enum tuples ONLY.
 * No DB writes, no storage clients, no upload/transform logic. Real column
 * placement and any additional bucket types are confirmed in Database V1
 * against the Data Dictionary. Anything unconfirmed is marked TODO(?) and must
 * be escalated rather than invented.
 */

/**
 * Classifies USER-UPLOADED media. Locked set per the Photo Buckets canon.
 * The curated, read-only library (see CuratedPhotoScope) is a SEPARATE system —
 * do not conflate the two.
 */
export const MEDIA_BUCKET_TYPES = [
	"housing",
	"meals",
	"facilities",
	"cover_photo",
	"community_photo",
	"verification_evidence",
] as const;
export type MediaBucketType = (typeof MEDIA_BUCKET_TYPES)[number];

/** Curated (read-only, app-provided) library crops. Two masters only. */
export const CURATED_PHOTO_SCOPES = ["icon", "landscape"] as const;
export type CuratedPhotoScope = (typeof CURATED_PHOTO_SCOPES)[number];

/** Aspect ratios locked for the two curated master crops. */
export const CURATED_MASTER_ASPECTS = {
	icon: "1:1",
	landscape: "3:2",
} as const;

/** How a final image is resolved: user upload vs curated pick. */
export const MEDIA_SOURCES = ["uploaded", "curated"] as const;
export type MediaSource = (typeof MEDIA_SOURCES)[number];

/**
 * Frame-not-filter is locked: host photos are framed with a hand-drawn paper
 * mat, never filtered or painted over. Absent photos fall back to a category
 * illustration (see docs/design/icon-system.md).
 */
export type PhotoTreatment = "frame_not_filter";

// ---------------------------------------------------------------------------
// Upload validation constants
// ---------------------------------------------------------------------------

/**
 * Allowed MIME types for user-uploaded listing media.
 * Enforced client-side and re-validated in storage RLS.
 */
export const UPLOAD_ALLOWED_MIME_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/heic",
] as const;
export type UploadAllowedMimeType = (typeof UPLOAD_ALLOWED_MIME_TYPES)[number];

/** Maximum size in bytes for a single uploaded file (5 MB). */
export const UPLOAD_MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Maximum number of gallery images (non-cover) a host may upload per listing. */
export const GALLERY_MAX_IMAGES = 10;

/** A responsive image descriptor (one high-res master -> on-demand variants). */
export interface ResponsiveImage {
	/** Storage path / key for the high-res master. */
	readonly masterPath: string;
	readonly width: number;
	readonly height: number;
	/** Blurhash / LQIP placeholder for instant paint. */
	readonly blurhash?: string;
	/** Required for accessibility. */
	readonly alt: string;
}

/** A piece of user-uploaded listing media, tagged by bucket. */
export interface ListingMedia extends ResponsiveImage {
	readonly id: string;
	readonly bucket: MediaBucketType;
	/** Ordering within its bucket gallery. */
	readonly sortOrder?: number;
}

/** A resolved image selection (the union resolver result). */
export type ImageSelection =
	| { readonly source: "uploaded"; readonly media: ListingMedia }
	| {
			readonly source: "curated";
			readonly scope: CuratedPhotoScope;
			readonly curatedPhotoId: string;
			readonly image: ResponsiveImage;
	  };

// TODO(?): Confirm exact curated_photos + listing media columns and the bucket
// access-policy split against the Exact Data Dictionary during Database V1.
// DB write logic is intentionally out of scope here.
