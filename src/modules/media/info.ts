// Media lookups for other modules. SP2: ownership and status for the listing photo checks, and an
// approved variant's bytes for the photo-slot check. SP4: one file's owner and status (the
// resume checks), a private file's bytes (resume import and upload-mode resumes) and deleting
// a file outright (unmerged import sources).
import { eq, inArray } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { notFound } from '@/lib/errors';
import { record } from '@/modules/audit';
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

/** One file's owner, kind and status. */
export type MediaRecord = {
  id: string;
  ownerUserId: string | null;
  ownerOrgId: string | null;
  kind: MediaKind;
  status: MediaStatus;
};

/** One file's owner, kind and status, or null when there is no such file. */
export async function getMedia(db: DbOrTx, id: string): Promise<MediaRecord | null> {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select({
      id: media.id,
      ownerUserId: media.ownerUserId,
      ownerOrgId: media.ownerOrgId,
      kind: media.kind,
      status: media.status,
    })
    .from(media)
    .where(eq(media.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * The bytes of an approved private file (a resume). Anything else, a file still scanning, a
 * rejected or public one or a missing object, is `not_found`. The caller authorizes the reader.
 */
export async function readMedia(db: DbOrTx, storage: Storage, id: string): Promise<Uint8Array> {
  if (!isUuid(id)) throw notFound('Media not found');
  const [row] = await db
    .select({ status: media.status, bucket: media.bucket, path: media.path })
    .from(media)
    .where(eq(media.id, id))
    .limit(1);
  if (!row || row.status !== 'approved' || row.bucket !== 'media-private') {
    throw notFound('Media not found');
  }
  try {
    return await storage.read(row.bucket, row.path);
  } catch (err) {
    if (err instanceof ObjectNotFoundError) throw notFound('Media not found');
    throw err;
  }
}

/**
 * Deletes a file outright: every stored copy (the original and each variant, in its bucket and
 * in quarantine), then its row, with an audit `media.removed`. An unknown id does nothing.
 * The row goes last, so a storage failure leaves it (and its object paths) for a retry instead of
 * orphaning the bytes; removing a missing object is not an error, so a retry is safe. Unlike
 * `removeMedia` (an operator takedown that keeps a private copy), nothing is kept: SP4 uses it
 * for resume-import sources once the import expires.
 */
export async function deleteMedia(db: DbOrTx, storage: Storage, id: string): Promise<void> {
  if (!isUuid(id)) return;
  const [row] = await db
    .select({
      kind: media.kind,
      bucket: media.bucket,
      path: media.path,
      variants: media.variants,
      ownerOrgId: media.ownerOrgId,
    })
    .from(media)
    .where(eq(media.id, id))
    .limit(1);
  if (!row) return;
  const paths = new Set([row.path, ...Object.values(row.variants ?? {})]);
  for (const p of paths) {
    await storage.remove(row.bucket, p);
    if (row.bucket !== 'quarantine') await storage.remove('quarantine', p);
  }
  // Only the call that actually deletes the row audits it (a concurrent call finds it gone).
  const deleted = await db.delete(media).where(eq(media.id, id)).returning({ id: media.id });
  if (deleted.length === 0) return;
  await record(db, {
    actorType: 'system',
    actorId: null,
    orgId: row.ownerOrgId,
    action: 'media.removed',
    subjectType: 'media',
    subjectId: id,
    data: { kind: row.kind },
  });
}
