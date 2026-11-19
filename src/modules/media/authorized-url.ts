// Signed and public URLs for callers that have already checked who is looking.
// Hiring and messaging use these instead of getMediaUrl, which enforces a viewer.
import { eq, inArray } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { notFound } from '@/lib/errors';
import { VARIANT_WIDTHS, type VariantWidth } from './kinds';
import { media } from './schema';
import type { Storage } from './storage';
import { isUuid } from './uploads';
import { SIGNED_URL_TTL_SEC } from './urls';

const LARGEST: VariantWidth = VARIANT_WIDTHS[VARIANT_WIDTHS.length - 1] ?? 1280;

function objectPath(
  variants: Record<string, string> | null,
  path: string,
  variant?: VariantWidth,
): string | null {
  if (variants) return variants[String(variant ?? LARGEST)] ?? null;
  return variant ? null : path;
}

/**
 * A 300-second signed URL for approved private media, or the public URL for approved public
 * media. Anything that is not approved is `not_found`. The caller must have checked the viewer.
 */
export async function getAuthorizedMediaUrl(
  db: DbOrTx,
  storage: Storage,
  mediaId: string,
  variant?: VariantWidth,
): Promise<string> {
  if (!isUuid(mediaId)) throw notFound('Media not found');
  const [row] = await db.select().from(media).where(eq(media.id, mediaId));
  if (!row || row.status !== 'approved') throw notFound('Media not found');
  const path = objectPath(row.variants, row.path, variant);
  if (!path) throw notFound('No such variant');
  if (row.bucket === 'media-public') return storage.publicUrl('media-public', path);
  if (row.bucket === 'media-private') {
    return storage.signedUrl('media-private', path, SIGNED_URL_TTL_SEC);
  }
  throw notFound('Media not found');
}

/**
 * Public URLs for approved `media-public` files at one variant width. Other ids are omitted.
 */
export async function getPublicMediaUrls(
  db: DbOrTx,
  storage: Storage,
  ids: string[],
  variant: VariantWidth,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const wanted = ids.filter((id) => isUuid(id));
  if (wanted.length === 0) return out;
  const rows = await db.select().from(media).where(inArray(media.id, wanted));
  for (const row of rows) {
    if (row.status !== 'approved' || row.bucket !== 'media-public' || !row.variants) continue;
    const path = row.variants[String(variant)];
    if (!path) continue;
    out.set(row.id, storage.publicUrl('media-public', path));
  }
  return out;
}
