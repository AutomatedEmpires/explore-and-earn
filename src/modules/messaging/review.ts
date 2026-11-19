// What an operator reads while deciding a message or a bulk template (SP5 W4).
import { eq } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { getOrgSummaries } from '@/modules/orgs';
import { bulkMessages, messages, threads } from './schema';

export async function getMessageForReview(
  db: DbOrTx,
  id: string,
  o?: { subjectType?: 'message' | 'bulk_message' },
): Promise<{ body: string; orgName: string; sentAt: Date } | null> {
  if (o?.subjectType === 'bulk_message') {
    const [bulk] = await db.select().from(bulkMessages).where(eq(bulkMessages.id, id));
    if (!bulk) return null;
    const orgName = (await getOrgSummaries(db, [bulk.orgId])).get(bulk.orgId)?.name ?? '';
    return { body: bulk.body, orgName, sentAt: bulk.createdAt };
  }
  const [row] = await db.select().from(messages).where(eq(messages.id, id));
  if (!row) return null;
  const [thread] = await db.select().from(threads).where(eq(threads.id, row.threadId));
  if (!thread) return null;
  const orgName = (await getOrgSummaries(db, [thread.orgId])).get(thread.orgId)?.name ?? '';
  return { body: row.body ?? '', orgName, sentAt: row.createdAt };
}
