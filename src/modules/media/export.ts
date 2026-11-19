// What a privacy export copies for one uploaded file (SP8 plan Task 9): the largest web variant
// of an image, or the stored PDF. Only approved files are exported: anything else was never
// shown to anyone, or is evidence.
import { eq } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import type { MediaKind } from './kinds';
import { media } from './schema';
import { ObjectNotFoundError, type Storage } from './storage';
import { isUuid } from './uploads';

const EXPORT_VARIANT = '1280';

/** The file name an export gives a media row: `<kind>-<id>.webp` for images, else `.pdf`. */
export function exportFileName(row: {
  id: string;
  kind: MediaKind;
  variants: Record<string, string> | null;
}): string {
  return `${row.kind}-${row.id}.${row.variants ? 'webp' : 'pdf'}`;
}

/** Null when the file isn't approved or its object is missing. */
export async function readMediaForExport(
  db: DbOrTx,
  storage: Storage,
  mediaId: string,
): Promise<{ name: string; mime: string; bytes: Uint8Array } | null> {
  if (!isUuid(mediaId)) return null;
  const [row] = await db
    .select({
      id: media.id,
      kind: media.kind,
      status: media.status,
      bucket: media.bucket,
      path: media.path,
      variants: media.variants,
    })
    .from(media)
    .where(eq(media.id, mediaId))
    .limit(1);
  if (!row || row.status !== 'approved') return null;

  const objectPath = row.variants ? row.variants[EXPORT_VARIANT] : row.path;
  if (!objectPath) return null;
  try {
    return {
      name: exportFileName(row),
      mime: row.variants ? 'image/webp' : 'application/pdf',
      bytes: await storage.read(row.bucket, objectPath),
    };
  } catch (err) {
    if (err instanceof ObjectNotFoundError) return null;
    throw err;
  }
}
