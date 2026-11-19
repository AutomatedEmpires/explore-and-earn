// Trust subjects, report subjects, the host page reply-time slot (SP5 W4), and the host-reply
// count SP4's silent-host check reads (legal review 7.3; issue 199).
import type { DbOrTx, Tx } from '@/lib/db';
import { REPLY_STATS } from '@/lib/messaging';
import { registerHostReplyCounter } from '@/modules/applications';
import { registerReportSubject } from '@/modules/safety';
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

registerReportSubject('message', { trustSubjectType: 'message', exists: messageExists });
registerReportSubject('thread', { trustSubjectType: 'thread', exists: threadExists });

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
