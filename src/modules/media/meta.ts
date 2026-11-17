// Media facts hiring and messaging may read. They never query app.media themselves.
import { inArray } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import type { MediaKind, MediaStatus } from './kinds';
import { media } from './schema';
import { isUuid } from './uploads';

export type MediaMeta = {
  ownerUserId: string;
  ownerOrgId: string | null;
  kind: MediaKind;
  status: MediaStatus;
  /** `detected_mime`, or `declared_mime` when nothing was detected. */
  mime: string;
  sizeBytes: number;
};

/** One entry per known id. Unknown ids are omitted. */
export async function getMediaMeta(db: DbOrTx, ids: string[]): Promise<Map<string, MediaMeta>> {
  const out = new Map<string, MediaMeta>();
  const wanted = ids.filter((id) => isUuid(id));
  if (wanted.length === 0) return out;
  const rows = await db
    .select({
      id: media.id,
      ownerUserId: media.ownerUserId,
      ownerOrgId: media.ownerOrgId,
      kind: media.kind,
      status: media.status,
      declaredMime: media.declaredMime,
      detectedMime: media.detectedMime,
      sizeBytes: media.sizeBytes,
    })
    .from(media)
    .where(inArray(media.id, wanted));
  for (const row of rows) {
    out.set(row.id, {
      ownerUserId: row.ownerUserId,
      ownerOrgId: row.ownerOrgId,
      kind: row.kind,
      status: row.status,
      mime: row.detectedMime ?? row.declaredMime,
      sizeBytes: row.sizeBytes,
    });
  }
  return out;
}
