// Read-only media lookups for other modules (SP2 touchpoints): ownership and status for the
// listing photo checks, and an approved variant's bytes for the photo-slot check.
import { inArray } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import type { MediaKind, MediaStatus, VariantWidth } from './kinds';
import { media } from './schema';
import { ObjectNotFoundError, type Storage } from './storage';
import { isUuid } from './uploads';

export type MediaInfo = {
  ownerOrgId: string | null;
  kind: MediaKind;
  status: MediaStatus;
  altText: string | null;
  width: number | null;
  height: number | null;
};

/** Owner, kind and status of each media id that exists; unknown (and malformed) ids are omitted. */
export async function getMediaInfo(db: DbOrTx, ids: string[]): Promise<Map<string, MediaInfo>> {
  const wanted = [...new Set(ids.filter(isUuid))];
  const out = new Map<string, MediaInfo>();
  if (wanted.length === 0) return out;
  const rows = await db
    .select({
      id: media.id,
      ownerOrgId: media.ownerOrgId,
      kind: media.kind,
      status: media.status,
      altText: media.altText,
      width: media.width,
      height: media.height,
    })
    .from(media)
    .where(inArray(media.id, wanted));
  for (const { id, ...info } of rows) out.set(id, info);
  return out;
}

/** Variants are WebP (see scan.ts). */
const VARIANT_MIME = 'image/webp';

/**
 * The bytes of an approved image's variant at `width`, or null when the media is unknown, not
 * approved, has no such variant, or its object is missing from storage.
 */
export async function readMediaVariant(
  db: DbOrTx,
  storage: Storage,
  mediaId: string,
  width: VariantWidth,
): Promise<{ mime: string; bytes: Uint8Array } | null> {
  if (!isUuid(mediaId)) return null;
  const [row] = await db
    .select({ status: media.status, bucket: media.bucket, variants: media.variants })
    .from(media)
    .where(inArray(media.id, [mediaId]))
    .limit(1);
  if (!row || row.status !== 'approved') return null;
  const objectPath = row.variants?.[String(width)];
  if (!objectPath) return null;
  try {
    return { mime: VARIANT_MIME, bytes: await storage.read(row.bucket, objectPath) };
  } catch (err) {
    if (err instanceof ObjectNotFoundError) return null;
    throw err;
  }
}
