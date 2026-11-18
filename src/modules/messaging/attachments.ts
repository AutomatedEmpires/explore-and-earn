// A signed URL for an attachment the viewer is allowed to see (SP5 W4).
import { eq } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { notFound } from '@/lib/errors';
import { getAuthorizedMediaUrl, getStorage } from '@/modules/media';
import type { VariantWidth } from '@/modules/media';
import type { ThreadViewer } from './access';
import { messages } from './schema';
import { canParticipate, loadThread, viewerMaySee } from './threads';

export async function getAttachmentUrl(
  db: DbOrTx,
  viewer: ThreadViewer,
  threadId: string,
  mediaId: string,
  variant?: VariantWidth,
): Promise<string> {
  const thread = await loadThread(db, threadId);
  if (!thread || !(await canParticipate(db, viewer, thread))) throw notFound();
  const rows = await db.select().from(messages).where(eq(messages.threadId, threadId));
  const visible = rows.some(
    (row) => row.attachmentMediaIds.includes(mediaId) && viewerMaySee(viewer, row),
  );
  if (!visible) throw notFound();
  return getAuthorizedMediaUrl(db, getStorage(), mediaId, variant);
}
