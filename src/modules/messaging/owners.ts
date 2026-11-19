// Who a thread, message or bulk message belongs to, for another module's rule that keeps what a
// legal hold covers (trust.checks_12m: a check on a message or bulk message; safety.reports_12m:
// a report about a thread or message). Read-only, and reads only this module's tables, so the
// caller never names them in raw SQL (tests/lint/table-ownership.test.ts).
import { eq, inArray } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { bulkMessages, messages, threads } from './schema';

/** The items messaging answers for. */
export type MessagingOwnedItem = 'thread' | 'message' | 'bulk_message';

/** The organization an item belongs to and the people on it, without duplicates. */
export type MessagingItemOwners = { orgId: string; userIds: string[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The owners of each item of one type, by id, in one read per type (two for bulk messages):
 * - a thread: its organization and its seeker;
 * - a message: its thread's organization and seeker, and the person who sent it;
 * - a bulk message: its organization, the person who sent it and the seekers of the threads
 *   it went to.
 * An id that is not a uuid or names no item is left out of the map.
 */
export async function messagingItemOwners(
  db: DbOrTx,
  type: MessagingOwnedItem,
  ids: readonly string[],
): Promise<Map<string, MessagingItemOwners>> {
  const wanted = [...new Set(ids.filter((id) => UUID.test(id)))];
  const out = new Map<string, MessagingItemOwners>();
  if (wanted.length === 0) return out;

  if (type === 'thread') {
    const rows = await db
      .select({ id: threads.id, orgId: threads.orgId, seeker: threads.seekerUserId })
      .from(threads)
      .where(inArray(threads.id, wanted));
    for (const row of rows) out.set(row.id, { orgId: row.orgId, userIds: [row.seeker] });
    return out;
  }

  if (type === 'message') {
    const rows = await db
      .select({
        id: messages.id,
        orgId: threads.orgId,
        seeker: threads.seekerUserId,
        sender: messages.senderUserId,
      })
      .from(messages)
      .innerJoin(threads, eq(threads.id, messages.threadId))
      .where(inArray(messages.id, wanted));
    for (const row of rows) {
      out.set(row.id, { orgId: row.orgId, userIds: people(row.seeker, row.sender) });
    }
    return out;
  }

  const bulks = await db
    .select({
      id: bulkMessages.id,
      orgId: bulkMessages.orgId,
      sender: bulkMessages.createdBy,
      threadIds: bulkMessages.threadIds,
    })
    .from(bulkMessages)
    .where(inArray(bulkMessages.id, wanted));
  const threadIds = [...new Set(bulks.flatMap((bulk) => bulk.threadIds))];
  const seekers = new Map<string, string>();
  if (threadIds.length > 0) {
    const rows = await db
      .select({ id: threads.id, seeker: threads.seekerUserId })
      .from(threads)
      .where(inArray(threads.id, threadIds));
    for (const row of rows) seekers.set(row.id, row.seeker);
  }
  for (const bulk of bulks) {
    out.set(bulk.id, {
      orgId: bulk.orgId,
      userIds: people(bulk.sender, ...bulk.threadIds.map((id) => seekers.get(id) ?? null)),
    });
  }
  return out;
}

function people(...ids: (string | null)[]): string[] {
  return [...new Set(ids.filter((id): id is string => id !== null))];
}
