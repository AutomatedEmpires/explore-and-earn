// Trust subjects, report subjects, the host page reply-time slot (SP5 W4), and the host-reply
// count SP4's silent-host check reads (legal review 7.3; issue 199). Only the thread's seeker, a
// member of the host org or an operator may report a thread or a message in it (issue 209).
import type { DbOrTx, Tx } from '@/lib/db';
import { REPLY_STATS } from '@/lib/messaging';
import { registerHostReplyCounter } from '@/modules/applications';
import { getOperator } from '@/modules/identity';
import { getMember } from '@/modules/orgs';
import { registerReportSubject, type Reporter } from '@/modules/safety';
// Application tests replace the hostpages barrel and omit this export. The lookup is not on
// the index, so both calls stay on the provider file.
// eslint-disable-next-line no-restricted-imports
import { getHostPageProvider, registerHostPageProvider } from '@/modules/hostpages/providers';
import { eq } from 'drizzle-orm';
import { registerSubjectHandlers } from '@/modules/trust';
import { decideBulk } from './bulk';
import { decideMessage } from './send';
import { messages, threads } from './schema';
import { getReplyStats } from './stats';
import { hostRepliesByApplication, setThreadReadOnly } from './threads';

registerSubjectHandlers('message', {
  approve: (db, id) => decideMessage(db, id, 'approve'),
  remove: (db, id) => decideMessage(db, id, 'remove'),
});

registerSubjectHandlers('thread', {
  approve: async () => {},
  remove: (db, id) => setThreadReadOnly(db as Tx, id, 'removed'),
});

registerSubjectHandlers('bulk_message', {
  approve: (db, id) => decideBulk(db, id, 'approve'),
  remove: (db, id) => decideBulk(db, id, 'remove'),
});

async function messageExists(db: DbOrTx, id: string): Promise<boolean> {
  const [row] = await db
    .select({ scanState: messages.scanState })
    .from(messages)
    .where(eq(messages.id, id));
  return row !== undefined && row.scanState !== 'removed';
}

async function threadExists(db: DbOrTx, id: string): Promise<boolean> {
  const [row] = await db.select({ id: threads.id }).from(threads).where(eq(threads.id, id));
  return row !== undefined;
}

const participants = { orgId: threads.orgId, seekerUserId: threads.seekerUserId };

/**
 * The thread's seeker, a live member of the host org who reports for that org, or an operator.
 * `report` refuses anyone else with the `not_found` of an unknown id, so a refusal never
 * confirms that the thread or the message exists.
 */
async function mayReportIn(
  db: DbOrTx,
  thread: { orgId: string; seekerUserId: string } | undefined,
  reporter: Reporter,
): Promise<boolean> {
  if (!thread) return false;
  if (reporter.userId === thread.seekerUserId) return true;
  if (reporter.orgId === thread.orgId && (await getMember(db, thread.orgId, reporter.userId))) {
    return true;
  }
  return (await getOperator(db, reporter.userId)) !== null;
}

async function mayReportThread(db: DbOrTx, id: string, reporter: Reporter): Promise<boolean> {
  const [row] = await db.select(participants).from(threads).where(eq(threads.id, id));
  return mayReportIn(db, row, reporter);
}

async function mayReportMessage(db: DbOrTx, id: string, reporter: Reporter): Promise<boolean> {
  const [row] = await db
    .select(participants)
    .from(messages)
    .innerJoin(threads, eq(threads.id, messages.threadId))
    .where(eq(messages.id, id));
  return mayReportIn(db, row, reporter);
}

registerReportSubject('message', {
  trustSubjectType: 'message',
  exists: messageExists,
  mayReport: mayReportMessage,
});
registerReportSubject('thread', {
  trustSubjectType: 'thread',
  exists: threadExists,
  mayReport: mayReportThread,
});

registerHostReplyCounter((db, orgId) => hostRepliesByApplication(db, orgId));

if (!getHostPageProvider('reply_time')) {
  registerHostPageProvider({
    kind: 'reply_time',
    fn: async (db, orgId) => {
      const stats = await getReplyStats(db, orgId);
      if (stats.conversations < REPLY_STATS.minConversations) return null;
      return { conversations: stats.conversations, withinADay: stats.usuallyRepliesWithinDay };
    },
  });
}
