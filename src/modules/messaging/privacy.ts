// Messaging's privacy registration. Export and erase land with the thread work (SP5 W4).
import { eq, sql } from 'drizzle-orm';
import type { Db, Tx } from '@/lib/db';
import { queryRows } from '@/lib/db';
import { DELETED_BODY } from '@/lib/messaging';
import { getHiringInfoMany, listForOrg } from '@/modules/listings';
import { getStorage, removeMedia } from '@/modules/media';
import { getOrgSummaries } from '@/modules/orgs';
import type {
  EraseResult,
  ExportPart,
  PrivacyHandler,
  PrivacySubject,
  RetentionRule,
} from '@/modules/privacy';
import { messages, orgReplyStats, savedReplies, threadReads, threads } from './schema';

const MONTHS_12 = 12;

function plusMonths(at: Date, months: number): string {
  const next = new Date(at);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next.toISOString();
}

async function listingTitle(db: Tx | Db, orgId: string, listingId: string): Promise<string> {
  const [info] = await getHiringInfoMany(db, [listingId]);
  if (info?.title) return info.title;
  const listed = await listForOrg(db, orgId);
  return listed.find((row) => row.id === listingId)?.title ?? '';
}

async function exportUser(db: Db | Tx, userId: string) {
  const owned = await db.select().from(threads).where(eq(threads.seekerUserId, userId));
  const sent = await db.select().from(messages).where(eq(messages.senderUserId, userId));
  const extraIds = [...new Set(sent.map((row) => row.threadId))].filter(
    (id) => !owned.some((row) => row.id === id),
  );
  const extra =
    extraIds.length === 0
      ? []
      : await db.select().from(threads).where(sql`${threads.id} in (${sql.join(extraIds.map((id) => sql`${id}::uuid`), sql`, `)})`);
  const all = [...owned, ...extra];
  const orgs = await getOrgSummaries(
    db,
    [...new Set(all.map((row) => row.orgId))],
  );
  const threadsOut = [];
  for (const thread of all) {
    const mine = sent.filter((row) => row.threadId === thread.id);
    threadsOut.push({
      threadId: thread.id,
      listingTitle: await listingTitle(db, thread.orgId, thread.listingId),
      orgName: orgs.get(thread.orgId)?.name ?? '',
      messages: mine.map((row) => ({
        id: row.id,
        body: row.body,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  }
  return threadsOut;
}

export const privacyHandler: PrivacyHandler = {
  module: 'messaging',
  tables: [
    'threads',
    'messages',
    'thread_reads',
    'saved_replies',
    'bulk_messages',
    'org_reply_stats',
  ],
  mediaColumns: [{ table: 'messages', column: 'attachment_media_ids', array: true }],
  async exportData(db, subject: PrivacySubject): Promise<ExportPart> {
    if (subject.kind === 'org') {
      const rows = await db.select().from(savedReplies).where(eq(savedReplies.orgId, subject.orgId));
      return {
        records: {
          savedReplies: rows.map((row) => ({
            id: row.id,
            kind: row.kind,
            title: row.title,
            body: row.body,
          })),
        },
        files: [],
      };
    }
    return { records: { threads: await exportUser(db, subject.userId) }, files: [] };
  },
  async erase(tx: Tx, subject, ctx): Promise<EraseResult> {
    if (ctx.holds.includes('all') || ctx.holds.includes('messages')) {
      return { erased: 0, retained: [{ table: 'messages', reason: 'legal_hold', until: null }] };
    }
    if (subject.kind === 'org') {
      const replies = await tx
        .delete(savedReplies)
        .where(eq(savedReplies.orgId, subject.orgId))
        .returning({ id: savedReplies.id });
      const stats = await tx
        .delete(orgReplyStats)
        .where(eq(orgReplyStats.orgId, subject.orgId))
        .returning({ orgId: orgReplyStats.orgId });
      return { erased: replies.length + stats.length, retained: [] };
    }
    const sent = await tx.select().from(messages).where(eq(messages.senderUserId, subject.userId));
    let erased = 0;
    const storage = getStorage();
    for (const row of sent) {
      for (const mediaId of row.attachmentMediaIds) {
        await removeMedia(tx, storage, mediaId);
        erased += 1;
      }
      if (row.body !== DELETED_BODY || row.attachmentMediaIds.length > 0) {
        await tx
          .update(messages)
          .set({ body: DELETED_BODY, attachmentMediaIds: [] })
          .where(eq(messages.id, row.id));
        if (row.body !== DELETED_BODY) erased += 1;
      }
    }
    const reads = await tx
      .delete(threadReads)
      .where(eq(threadReads.userId, subject.userId))
      .returning({ threadId: threadReads.threadId });
    erased += reads.length;
    const [latest] = await queryRows<{ at: string | null }>(
      tx,
      sql`
        select max(m.created_at) as at
        from app.messages m
        join app.threads t on t.id = m.thread_id
        where t.seeker_user_id = ${subject.userId} or m.sender_user_id = ${subject.userId}
      `,
    );
    const until = latest?.at ? plusMonths(new Date(latest.at), MONTHS_12) : null;
    return {
      erased,
      retained: until ? [{ table: 'messages', reason: 'shared_record', until }] : [],
    };
  },
};

export const retentionRules: RetentionRule[] = [
  {
    key: 'messaging.messages_12m',
    description: 'Deletes messages older than 12 months.',
    async run(db, now, limit) {
      const cutoff = new Date(now);
      cutoff.setUTCMonth(cutoff.getUTCMonth() - MONTHS_12);
      const cap = Math.max(0, Math.floor(limit));
      const rows = await queryRows<{ id: string }>(
        db,
        sql`
          delete from app.threads
          where id in (
            select t.id from app.threads t
            where t.listing_closed_at < ${cutoff.toISOString()}::timestamptz
              and (
                select max(m.created_at) from app.messages m where m.thread_id = t.id
              ) < ${cutoff.toISOString()}::timestamptz
            limit ${cap}
          )
          returning id
        `,
      );
      return { deleted: rows.length };
    },
  },
];
