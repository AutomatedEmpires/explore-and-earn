// Who has read a thread, and how many threads are still unread (SP5 W4).
import { sql } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { queryRows } from '@/lib/db';
import { notFound } from '@/lib/errors';
import { findHostMembership, listMembers } from '@/modules/orgs';
import { markReadByData } from '@/modules/notifications';
import type { HostContext } from '@/server/guards';
import { listingScope, type ThreadViewer } from './access';
import { threadReads } from './schema';
import { canParticipate, loadThread, viewerUserId } from './threads';

const TEAM = new Set<HostContext['role']>(['owner', 'admin', 'recruiter']);

export async function markThreadRead(db: DbOrTx, viewer: ThreadViewer, threadId: string): Promise<void> {
  const thread = await loadThread(db, threadId);
  if (!thread || !(await canParticipate(db, viewer, thread))) throw notFound();
  const userId = viewerUserId(viewer);
  const now = new Date();
  await db
    .insert(threadReads)
    .values({ threadId, userId, lastReadAt: now })
    .onConflictDoUpdate({
      target: [threadReads.threadId, threadReads.userId],
      set: { lastReadAt: now },
    });
  await markReadByData(db, userId, { types: ['messages.new'], key: 'threadId', value: threadId });
}

async function hostContext(db: DbOrTx, userId: string, orgId?: string): Promise<HostContext | null> {
  const membership = await findHostMembership(db, userId, null);
  const resolvedOrg = orgId ?? membership?.orgId;
  if (!resolvedOrg) return null;
  const members = await listMembers(db, resolvedOrg);
  const member = members.find((row) => row.userId === userId);
  if (!member || !TEAM.has(member.role)) return null;
  return {
    user: { id: userId, clerkUserId: userId, accountType: 'host', email: member.email },
    orgId: resolvedOrg,
    role: member.role,
  };
}

export async function unreadThreadCount(
  db: DbOrTx,
  userId: string,
  o?: { orgId?: string },
): Promise<number> {
  const host = await hostContext(db, userId, o?.orgId);
  if (!host) return seekerUnread(db, userId);
  const scope = await listingScope(db, host);
  if (!scope.all && scope.listingIds.length === 0) return 0;
  const listingFilter = scope.all
    ? sql``
    : sql`and t.listing_id in (${sql.join(
        scope.listingIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`;
  const [row] = await queryRows<{ n: number }>(
    db,
    sql`
      select count(*)::int as n
      from app.threads t
      left join app.thread_reads r on r.thread_id = t.id and r.user_id = ${userId}
      where t.org_id = ${host.orgId}
        and t.last_to_host_at is not null
        and (r.last_read_at is null or t.last_to_host_at > r.last_read_at)
        ${listingFilter}
    `,
  );
  return row?.n ?? 0;
}

async function seekerUnread(db: DbOrTx, userId: string): Promise<number> {
  const [row] = await queryRows<{ n: number }>(
    db,
    sql`
      select count(*)::int as n
      from app.threads t
      left join app.thread_reads r on r.thread_id = t.id and r.user_id = ${userId}
      where t.seeker_user_id = ${userId}
        and t.last_to_seeker_at is not null
        and (r.last_read_at is null or t.last_to_seeker_at > r.last_read_at)
    `,
  );
  return row?.n ?? 0;
}
