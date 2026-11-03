// Media kinds, statuses and the per-kind upload rules (spec section 7). SVG is never allowed:
// it is a document that can carry scripts, not an image we can re-encode.

export const MEDIA_KINDS = [
  'avatar',
  'cover',
  'logo',
  'listing_photo',
  'housing_photo',
  'meal_photo',
  'community_photo',
  'resume',
  'attachment',
] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const MEDIA_STATUSES = [
  'uploaded',
  'scanning',
  'in_review',
  'approved',
  'rejected',
  'blocked',
] as const;
export type MediaStatus = (typeof MEDIA_STATUSES)[number];

/**
 * Storage buckets. `quarantine` holds uploads until scanned; `media-public` is the only public
 * one; `evidence` (child-safety originals) is restricted to the service role.
 */
export const BUCKETS = ['quarantine', 'media-public', 'media-private', 'evidence'] as const;
export type Bucket = (typeof BUCKETS)[number];

/** Why a file was rejected, stored in `app.media.rejection_reason`. */
export type RejectionReason =
  | 'type_mismatch'
  | 'too_large'
  | 'missing_file'
  | 'invalid_image'
  | 'invalid_pdf'
  | 'malware'
  | 'unsafe_content'
  | 'removed_by_operator';

export const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;
export type ImageMime = (typeof IMAGE_MIMES)[number];
export type AllowedMime = ImageMime | 'application/pdf';

export type KindRule = { mimes: readonly AllowedMime[]; maxBytes: number };

const MB = 1024 * 1024;
const image: KindRule = { mimes: IMAGE_MIMES, maxBytes: 15 * MB };

export const KIND_RULES: Record<MediaKind, KindRule> = {
  avatar: image,
  cover: image,
  logo: image,
  listing_photo: image,
  housing_photo: image,
  meal_photo: image,
  community_photo: image,
  resume: { mimes: ['application/pdf'], maxBytes: 10 * MB },
  attachment: {
    mimes: ['application/pdf', 'image/jpeg', 'image/png', 'image/heic'],
    maxBytes: 10 * MB,
  },
};

/** Photos shown on public pages get AI-written alt text (spec section 7). */
export const ALT_TEXT_KINDS: readonly MediaKind[] = [
  'listing_photo',
  'housing_photo',
  'meal_photo',
  'community_photo',
];

/** Kinds that are never public: served only by short-lived signed URLs. */
export const PRIVATE_KINDS: readonly MediaKind[] = ['resume', 'attachment'];

/** WebP widths written for every image. */
export const VARIANT_WIDTHS = [320, 640, 1280] as const;
export type VariantWidth = (typeof VARIANT_WIDTHS)[number];

/**
 * A MIME type in the form the rules use: lower case, without parameters, with `image/heif`
 * folded into `image/heic` (the same container; detectors and browsers use both names).
 */
export function canonicalMime(mime: string): string {
  const base = (mime.split(';')[0] ?? '').trim().toLowerCase();
  return base === 'image/heif' ? 'image/heic' : base;
}

export function isImageMime(mime: string): mime is ImageMime {
  return (IMAGE_MIMES as readonly string[]).includes(mime);
}

/** Whether `kind` accepts this (canonical) MIME type. */
export function allowsMime(kind: MediaKind, mime: string): mime is AllowedMime {
  return (KIND_RULES[kind].mimes as readonly string[]).includes(mime);
}
