// Removes one blocked file for good, once its preservation period has ended. The caller (the
// `operator.child_safety_evidence` retention rule) decides when that is, from the NCMEC
// submission date and any legal hold; this function only knows how to remove the file.
import { and, eq } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { record } from '@/modules/audit';
import { media } from './schema';
import { getStorage, type Storage } from './storage';
import { isUuid } from './uploads';

/**
 * For a `blocked` file: deletes the preserved original (`evidence/<id>`), the quarantine copy
 * and the row, and returns true. Any other file, or an unknown id, is left alone and returns
 * false.
 *
 * The objects go first. If the call stops halfway the row is still `blocked`, and the next call
 * finishes the job (removing a missing object is not an error).
 */
export async function purgeBlockedMedia(
  db: DbOrTx,
  mediaId: string,
  storage: Storage = getStorage(),
): Promise<boolean> {
  if (!isUuid(mediaId)) return false;
  const [row] = await db
    .select({ status: media.status, kind: media.kind, ownerOrgId: media.ownerOrgId })
    .from(media)
    .where(eq(media.id, mediaId))
    .limit(1);
  if (row?.status !== 'blocked') return false;

  await storage.remove('evidence', mediaId);
  // An upload's quarantine path is its id (requestUpload), and block() keeps that copy.
  await storage.remove('quarantine', mediaId);

  const deleted = await db
    .delete(media)
    .where(and(eq(media.id, mediaId), eq(media.status, 'blocked')))
    .returning({ id: media.id });
  if (deleted.length === 0) return false;

  await record(db, {
    actorType: 'system',
    actorId: null,
    orgId: row.ownerOrgId,
    action: 'media.evidence_purged',
    subjectType: 'media',
    subjectId: mediaId,
    data: { kind: row.kind },
  });
  return true;
}
