// Media URLs. Approved public files have permanent public URLs. Everything else is private:
// a 300-second signed URL, only for the owner, a member of the owning organization or an
// operator. A blocked file (child-safety match) is never served to anyone.
import { eq } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { forbidden, notFound } from '@/lib/errors';
import { VARIANT_WIDTHS, type VariantWidth } from './kinds';
import { media } from './schema';
import type { Storage } from './storage';
import { isUuid } from './uploads';

/** Who is asking. The caller resolves the viewer's organizations and operator status. */
export type MediaViewer = { userId: string; orgIds: string[]; isOperator: boolean };

export const SIGNED_URL_TTL_SEC = 300;

const LARGEST: VariantWidth = VARIANT_WIDTHS[VARIANT_WIDTHS.length - 1] ?? 1280;

/**
 * The URL of a media file, for images at one variant width (default the largest).
 * Throws `not_found` for an unknown id or a file not available (still scanning, or
 * rejected), and `forbidden` when the viewer may not read it.
 */
export async function getMediaUrl(
  db: DbOrTx,
  storage: Storage,
  viewer: MediaViewer,
  mediaId: string,
  variant?: VariantWidth,
): Promise<string> {
  if (!isUuid(mediaId)) throw notFound('Media not found');
  const [row] = await db.select().from(media).where(eq(media.id, mediaId));
  if (!row) throw notFound('Media not found');

  const objectPath = row.variants ? row.variants[String(variant ?? LARGEST)] : row.path;
  if (!objectPath) throw notFound('No such variant');

  if (row.status === 'approved' && row.bucket === 'media-public') {
    return storage.publicUrl('media-public', objectPath);
  }

  const mayRead =
    viewer.isOperator ||
    viewer.userId === row.ownerUserId ||
    (row.ownerOrgId !== null && viewer.orgIds.includes(row.ownerOrgId));
  if (!mayRead || row.status === 'blocked') throw forbidden('You cannot view this file');

  if ((row.status === 'approved' || row.status === 'in_review') && row.bucket === 'media-private') {
    return storage.signedUrl('media-private', objectPath, SIGNED_URL_TTL_SEC);
  }
  throw notFound('This file is not available');
}
