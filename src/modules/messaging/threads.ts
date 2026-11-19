// Threads, participation and reading (SP5 W4). A host the applicant verification gate refuses
// lists and reads no thread (gate.ts; issue 199).
import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { DbOrTx, Tx } from '@/lib/db';
import { queryRows } from '@/lib/db';
import { conflict, notFound } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { track } from '@/lib/analytics';
import {
  MESSAGES,
  READ_ONLY,
  type MessageState,
  type MessageView,
  type ReadOnlyReason,
  type ThreadCard,
  type ThreadEventCode,
  type ThreadSummary,
  type ThreadView,
} from '@/lib/messaging';
import { getMediaMeta } from '@/modules/media';
import { getHiringInfoMany, listForOrg } from '@/modules/listings';
import { getOrgSummaries, listMembers } from '@/modules/orgs';
import { getCommunityIdentities } from '@/modules/profiles';
import { getRelationships, isBlockedBetween } from '@/modules/safety';
import type { HostContext } from '@/server/guards';
import { inScope, listingScope, requireHiringCapability, type ThreadViewer } from './access';
import { hostMayMessage, orgMayMessage, requireMessagingAccess } from './gate';
import { messages, threads } from './schema';

const PAGE = 30;
const TEAM = new Set<HostContext['role']>(['owner', 'admin', 'recruiter']);
const CLOSE_MS = MESSAGES.readOnlyAfterCloseDays * 24 * 60 * 60 * 1000;

type ThreadRow = typeof threads.$inferSelect;
type MessageRow = typeof messages.$inferSelect;

export async function loadThread(db: DbOrTx, threadId: string): Promise<ThreadRow | null> {
  const [row] = await db.select().from(threads).where(eq(threads.id, threadId));
  return row ?? null;
}

export async function loadMessage(db: DbOrTx, messageId: string): Promise<MessageRow | null> {
  const [row] = await db.select().from(messages).where(eq(messages.id, messageId));
  return row ?? null;
}

function closedLongEnough(row: ThreadRow, now: Date): boolean {
  return row.listingClosedAt !== null && now.getTime() - row.listingClosedAt.getTime() > CLOSE_MS;
}

/**
 * Stored reason, a listing closed more than 90 days, a block either way, or a host whose team may
 * not message applicants (the applicant verification gate refuses it): `unavailable`, which
 * names no reason and is never stored, so the thread opens again once the host is verified.
 */
export async function blockingReason(
  db: DbOrTx,
  row: ThreadRow,
  now = new Date(),
): Promise<ReadOnlyReason | null> {
  if (
    row.readOnlyReason === 'withdrawn' ||
    row.readOnlyReason === 'blocked' ||
    row.readOnlyReason === 'removed'
  ) {
    return row.readOnlyReason;
  }
  if (closedLongEnough(row, now)) return 'listing_closed';
  const [rel] = await getRelationships(db, {
    orgId: row.orgId,
    seekerUserIds: [row.seekerUserId],
  });
  if (rel?.blocked) return 'blocked';
  return (await hostMayMessage(db, row.orgId)) ? null : 'unavailable';
}

/** Stamps `blocked` when the thread has no reason yet. A later `removed` still wins. */
export async function stampBlocked(db: DbOrTx, row: ThreadRow): Promise<void> {
  if (row.readOnlyReason) return;
  await db
    .update(threads)
    .set({ readOnlyReason: 'blocked' })
    .where(and(eq(threads.id, row.id), isNull(threads.readOnlyReason)));
  row.readOnlyReason = 'blocked';
}

/**
 * A seeker owns the thread. A host acts for one org: the thread must belong to that org, and
 * the member's role and listing scope must cover it. A scope of `all` means every listing of
 * the host's own org, never another org's.
 */
export async function canParticipate(
  db: DbOrTx,
  viewer: ThreadViewer,
  row: ThreadRow,
): Promise<boolean> {
  if (viewer.kind === 'seeker') return viewer.userId === row.seekerUserId;
  if (row.orgId !== viewer.ctx.orgId) return false;
  if (!TEAM.has(viewer.ctx.role)) return false;
  const scope = await listingScope(db, viewer.ctx);
  return inScope(scope, row.listingId);
}

export function viewerUserId(viewer: ThreadViewer): string {
  return viewer.kind === 'seeker' ? viewer.userId : viewer.ctx.user.id;
}

/** A seeker sees clear or warn text, and anything they sent that was not removed. */
export function viewerMaySee(viewer: ThreadViewer, row: MessageRow): boolean {
  if (viewer.kind === 'host') return !(row.senderType === 'seeker' && row.scanState === 'removed');
  if (row.visibleTo !== 'all' || row.scanState === 'removed') return false;
  if (row.senderUserId === viewer.userId) return true;
  return row.scanState === 'clear' || row.scanState === 'warn';
}

function firstToken(name: string | null | undefined): string | null {
  const token = name?.trim().split(/\s+/)[0];
  return token || null;
}

function hostState(scan: MessageRow['scanState']): MessageState {
  if (scan === 'pending') return 'sending';
  if (scan === 'held') return 'not_delivered';
  if (scan === 'removed') return 'removed';
  return 'sent';
}

function cutPreview(body: string | null): string | null {
  if (!body) return null;
  const points = [...body];
  if (points.length <= MESSAGES.previewMax) return body;
  return points.slice(0, MESSAGES.previewMax).join('');
}

async function listingTitles(
  db: DbOrTx,
  orgId: string,
  listingIds: string[],
): Promise<Map<string, string>> {
  const info = await getHiringInfoMany(db, listingIds);
  const titles = new Map(info.map((row) => [row.id, row.title]));
  if (listingIds.every((id) => titles.has(id))) return titles;
  const listed = await listForOrg(db, orgId);
  for (const row of listed) {
    if (!titles.has(row.id) && row.title) titles.set(row.id, row.title);
  }
  return titles;
}

async function presentMessages(
  db: DbOrTx,
  viewer: ThreadViewer,
  thread: ThreadRow,
  rows: MessageRow[],
): Promise<MessageView[]> {
  const mediaIds = rows.flatMap((row) => row.attachmentMediaIds);
  const media = await getMediaMeta(db, mediaIds);
  const senderIds = rows.flatMap((row) => (row.senderUserId ? [row.senderUserId] : []));
  const identities = await getCommunityIdentities(db, [...senderIds, thread.seekerUserId]);
  const members = await listMembers(db, thread.orgId);
  const hostNames = new Map(members.map((member) => [member.userId, firstToken(member.displayName)]));
  const mineId = viewerUserId(viewer);

  return rows.map((row) => {
    const seekerName = row.senderUserId ? (identities.get(row.senderUserId)?.firstName ?? null) : null;
    const senderFirstName =
      row.senderType === 'system'
        ? null
        : row.senderType === 'host'
          ? (hostNames.get(row.senderUserId ?? '') ?? seekerName)
          : seekerName;
    const state = viewer.kind === 'host' && row.senderType === 'host' ? hostState(row.scanState) : null;
    return {
      id: row.id,
      clientId: row.clientId,
      kind: row.kind as MessageView['kind'],
      mine: row.senderUserId === mineId,
      senderType: row.senderType as MessageView['senderType'],
      senderFirstName,
      body: row.body,
      attachments: row.attachmentMediaIds.map((mediaId) => ({
        mediaId,
        mime: media.get(mediaId)?.mime ?? 'application/octet-stream',
      })),
      card:
        row.cardType && row.cardRefId
          ? { type: row.cardType as ThreadCard['type'], refId: row.cardRefId }
          : null,
      event: (row.eventCode as ThreadEventCode | null) ?? null,
      warn: row.scanState === 'warn',
      state,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

export async function presentMessage(
  db: DbOrTx,
  viewer: ThreadViewer,
  thread: ThreadRow,
  row: MessageRow,
): Promise<MessageView> {
  const [view] = await presentMessages(db, viewer, thread, [row]);
  if (!view) throw notFound();
  return view;
}

export async function ensureThread(
  tx: Tx,
  i: {
    orgId: string;
    listingId: string;
    seekerUserId: string;
    applicationId?: string;
    inviteId?: string;
  },
): Promise<{ threadId: string; created: boolean }> {
  const [existing] = await tx
    .select()
    .from(threads)
    .where(and(eq(threads.listingId, i.listingId), eq(threads.seekerUserId, i.seekerUserId)));
  if (existing) {
    const patch: Partial<typeof threads.$inferInsert> = {};
    if (!existing.applicationId && i.applicationId) patch.applicationId = i.applicationId;
    if (!existing.inviteId && i.inviteId) patch.inviteId = i.inviteId;
    if (Object.keys(patch).length > 0) {
      await tx.update(threads).set(patch).where(eq(threads.id, existing.id));
    }
    return { threadId: existing.id, created: false };
  }
  const threadId = newId();
  await tx.insert(threads).values({
    id: threadId,
    orgId: i.orgId,
    listingId: i.listingId,
    seekerUserId: i.seekerUserId,
    applicationId: i.applicationId ?? null,
    inviteId: i.inviteId ?? null,
  });
  return { threadId, created: true };
}

export async function postCard(
  tx: Tx,
  threadId: string,
  card: ThreadCard,
  senderUserId: string | null,
): Promise<string> {
  const thread = await loadThread(tx, threadId);
  if (!thread) throw notFound();
  const senderType =
    senderUserId === null ? 'system' : senderUserId === thread.seekerUserId ? 'seeker' : 'host';
  const id = newId();
  const now = new Date();
  await tx.insert(messages).values({
    id,
    threadId,
    senderType,
    senderUserId,
    kind: 'card',
    cardType: card.type,
    cardRefId: card.refId,
    visibleTo: 'all',
    scanState: 'clear',
    createdAt: now,
  });
  const patch: Partial<typeof threads.$inferInsert> = {};
  if (senderType === 'seeker' || senderType === 'system') patch.lastToHostAt = now;
  else patch.lastToSeekerAt = now;
  if (senderType === 'host' && !thread.firstHostReplyAt) patch.firstHostReplyAt = now;
  await tx.update(threads).set(patch).where(eq(threads.id, threadId));
  return id;
}

export async function postEvent(
  tx: Tx,
  threadId: string,
  e: { code: ThreadEventCode; visibleTo: 'all' | 'host' },
): Promise<string> {
  const id = newId();
  await tx.insert(messages).values({
    id,
    threadId,
    senderType: 'system',
    kind: 'event',
    eventCode: e.code,
    visibleTo: e.visibleTo,
    scanState: 'clear',
  });
  return id;
}

export async function setThreadReadOnly(
  tx: Tx,
  threadId: string,
  reason: 'withdrawn' | 'blocked' | 'removed',
): Promise<void> {
  const thread = await loadThread(tx, threadId);
  if (!thread) return;
  if (thread.readOnlyReason && reason !== 'removed') return;
  await tx.update(threads).set({ readOnlyReason: reason }).where(eq(threads.id, threadId));
}

export async function markThreadHired(tx: Tx, threadId: string): Promise<void> {
  await tx
    .update(threads)
    .set({ hiredAt: new Date() })
    .where(and(eq(threads.id, threadId), isNull(threads.hiredAt)));
}

export async function threadIdsForApplications(
  db: DbOrTx,
  applicationIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (applicationIds.length === 0) return out;
  const rows = await db
    .select({ applicationId: threads.applicationId, id: threads.id })
    .from(threads)
    .where(inArray(threads.applicationId, applicationIds));
  for (const row of rows) {
    if (row.applicationId) out.set(row.applicationId, row.id);
  }
  return out;
}

/**
 * Host replies per application (legal review 7.3: the silent-host alert counts them as answers).
 * A reply is a message the org's team sent in the application's thread, text or card, including
 * one still in the scan; one the scan or an operator held or removed never reached the
 * applicant and does not count. With `applicationIds`, each id is in the map, 0 when the host
 * has not replied; without, every application of the org that has a reply.
 */
export async function hostRepliesByApplication(
  db: DbOrTx,
  orgId: string,
  applicationIds?: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>((applicationIds ?? []).map((id) => [id, 0]));
  if (applicationIds?.length === 0) return out;
  const filters = [
    eq(threads.orgId, orgId),
    isNotNull(threads.applicationId),
    eq(messages.senderType, 'host'),
    notInArray(messages.scanState, ['held', 'removed']),
  ];
  if (applicationIds) filters.push(inArray(threads.applicationId, applicationIds));
  const rows = await db
    .select({ applicationId: threads.applicationId, n: sql<number>`count(*)::int` })
    .from(threads)
    .innerJoin(messages, eq(messages.threadId, threads.id))
    .where(and(...filters))
    .groupBy(threads.applicationId);
  for (const row of rows) {
    if (row.applicationId) out.set(row.applicationId, row.n);
  }
  return out;
}

async function requireThread(
  db: DbOrTx,
  viewer: ThreadViewer,
  threadId: string,
): Promise<ThreadRow> {
  const thread = await loadThread(db, threadId);
  if (!thread || !(await canParticipate(db, viewer, thread))) throw notFound();
  return thread;
}

/**
 * The read-only reason as `viewer` may see it. A thread closed by a block reads `blocked` only
 * to the side that made a block that still stands; the other side, and both sides after an
 * unblock, see `unavailable`. So a seeker never learns that a host blocked them, and a host
 * never learns that a seeker did (SP4 spec 8.7 and 10). A thread whose host may not message
 * applicants already reads `unavailable` (`blockingReason`), so the seeker never learns why.
 */
async function viewerReason(
  db: DbOrTx,
  viewer: ThreadViewer,
  row: ThreadRow,
  reason: ReadOnlyReason | null,
): Promise<ReadOnlyReason | null> {
  if (reason !== 'blocked') return reason;
  const seeker = { type: 'user', id: row.seekerUserId } as const;
  const org = { type: 'org', id: row.orgId } as const;
  const mine =
    viewer.kind === 'seeker'
      ? await isBlockedBetween(db, seeker, org)
      : await isBlockedBetween(db, org, seeker);
  return mine.byA ? 'blocked' : 'unavailable';
}

/**
 * One page of a thread. A host the applicant verification gate refuses gets the applicant
 * list's 409 before anything is read. The seeker reads their messages whatever the host's status;
 * while the host is refused, the thread reads `unavailable` and takes no message.
 */
export async function getThread(
  db: DbOrTx,
  viewer: ThreadViewer,
  threadId: string,
  o?: { before?: string },
): Promise<ThreadView> {
  if (viewer.kind === 'host') await requireMessagingAccess(db, viewer.ctx.orgId);
  const thread = await requireThread(db, viewer, threadId);
  const now = new Date();
  let reason = await blockingReason(db, thread, now);
  if (reason === 'blocked' && !thread.readOnlyReason) {
    await stampBlocked(db, thread);
    reason = 'blocked';
  }
  const before = decodeCursor(o?.before);
  const filters = [eq(messages.threadId, threadId), visibilitySql(viewer)];
  if (before) {
    filters.push(
      definedSql(
        or(
          sql`${messages.createdAt} < ${before.at.toISOString()}::timestamptz`,
          and(
            sql`${messages.createdAt} = ${before.at.toISOString()}::timestamptz`,
            sql`${messages.id} < ${before.id}`,
          ),
        ),
      ),
    );
  }
  const rows = await db
    .select()
    .from(messages)
    .where(and(...filters))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(PAGE + 1);
  const page = rows.slice(0, PAGE);
  const last = page[page.length - 1];
  const titles = await listingTitles(db, thread.orgId, [thread.listingId]);
  const orgs = await getOrgSummaries(db, [thread.orgId]);
  const identities = await getCommunityIdentities(db, [thread.seekerUserId]);
  track('messaging.thread_opened', { threadId }, viewerUserId(viewer));
  return {
    thread: {
      id: thread.id,
      listingId: thread.listingId,
      listingTitle: titles.get(thread.listingId) ?? '',
      orgId: thread.orgId,
      orgName: orgs.get(thread.orgId)?.name ?? '',
      seekerFirstName: identities.get(thread.seekerUserId)?.firstName ?? '',
      applicationId: thread.applicationId,
      inviteId: thread.inviteId,
      hired: thread.hiredAt !== null,
    },
    messages: await presentMessages(db, viewer, thread, page),
    nextBefore: rows.length > PAGE && last ? encodeCursor(last.createdAt, last.id) : null,
    readOnly: await viewerReason(db, viewer, thread, reason),
    canSend: reason === null,
  };
}

function visibilitySql(viewer: ThreadViewer): SQL {
  if (viewer.kind === 'host') {
    return definedSql(or(ne(messages.senderType, 'seeker'), ne(messages.scanState, 'removed')));
  }
  return definedSql(
    and(
      eq(messages.visibleTo, 'all'),
      ne(messages.scanState, 'removed'),
      or(eq(messages.senderUserId, viewer.userId), inArray(messages.scanState, ['clear', 'warn'])),
    ),
  );
}

function definedSql(value: SQL | undefined): SQL {
  if (!value) throw new Error('expected a sql condition');
  return value;
}

function encodeCursor(at: Date, id: string): string {
  return `${at.getTime()}|${id}`;
}

function decodeCursor(cursor: string | undefined): { at: Date; id: string } | null {
  if (!cursor) return null;
  const [ms, id] = cursor.split('|');
  if (!ms || !id) return null;
  const at = new Date(Number(ms));
  if (Number.isNaN(at.getTime())) return null;
  return { at, id };
}

export async function listThreads(
  db: DbOrTx,
  viewer: ThreadViewer,
  q: { listingId?: string; unread?: boolean; cursor?: string } = {},
): Promise<{ items: ThreadSummary[]; nextCursor: string | null }> {
  const seeker = viewer.kind === 'seeker';
  const userId = viewerUserId(viewer);
  const filters = [];
  if (seeker) {
    filters.push(eq(threads.seekerUserId, userId));
  } else {
    requireHiringCapability(viewer.ctx, 'messages.access');
    await requireMessagingAccess(db, viewer.ctx.orgId);
    const scope = await listingScope(db, viewer.ctx);
    filters.push(eq(threads.orgId, viewer.ctx.orgId));
    if (!scope.all) {
      if (scope.listingIds.length === 0) return { items: [], nextCursor: null };
      filters.push(inArray(threads.listingId, scope.listingIds));
    }
    if (q.listingId) {
      if (!inScope(scope, q.listingId)) return { items: [], nextCursor: null };
      filters.push(eq(threads.listingId, q.listingId));
    }
  }
  const sort = seeker ? threads.lastToSeekerAt : threads.lastToHostAt;
  if (q.unread) {
    filters.push(sql`${sort} is not null`);
    filters.push(
      sql`(${sort} > (select r.last_read_at from app.thread_reads r where r.thread_id = ${threads.id} and r.user_id = ${userId}) or not exists (select 1 from app.thread_reads r where r.thread_id = ${threads.id} and r.user_id = ${userId}))`,
    );
  }
  const cursor = decodeCursor(q.cursor);
  if (cursor) {
    // and() does not wrap a raw fragment, so the keyset is built with or()/and(), which do.
    // A bare `a < x or (a = x and id < y)` would drop the tenant filter above it.
    const at = sql`coalesce(${sort}, ${threads.createdAt})`;
    const atCursor = sql`${cursor.at.toISOString()}::timestamptz`;
    filters.push(
      definedSql(
        or(sql`${at} < ${atCursor}`, and(sql`${at} = ${atCursor}`, sql`${threads.id} < ${cursor.id}`)),
      ),
    );
  }
  const rows = await db
    .select()
    .from(threads)
    .where(and(...filters))
    .orderBy(sql`coalesce(${sort}, ${threads.createdAt}) desc`, desc(threads.id))
    .limit(PAGE + 1);
  const page = rows.slice(0, PAGE);
  const items = await summarize(db, viewer, page);
  const last = page[page.length - 1];
  const lastAt = last ? (seeker ? last.lastToSeekerAt : last.lastToHostAt) ?? last.createdAt : null;
  return {
    items,
    nextCursor: rows.length > PAGE && last && lastAt ? encodeCursor(lastAt, last.id) : null,
  };
}

async function summarize(
  db: DbOrTx,
  viewer: ThreadViewer,
  rows: ThreadRow[],
): Promise<ThreadSummary[]> {
  if (rows.length === 0) return [];
  const userId = viewerUserId(viewer);
  const seeker = viewer.kind === 'seeker';
  const orgIds = [...new Set(rows.map((row) => row.orgId))];
  const orgs = await getOrgSummaries(db, orgIds);
  const identities = await getCommunityIdentities(
    db,
    rows.map((row) => row.seekerUserId),
  );
  const titles = new Map<string, string>();
  for (const orgId of orgIds) {
    const ids = rows.filter((row) => row.orgId === orgId).map((row) => row.listingId);
    const found = await listingTitles(db, orgId, ids);
    for (const [id, title] of found) titles.set(id, title);
  }
  const reads = await queryRows<{ thread_id: string; last_read_at: string }>(
    db,
    sql`select thread_id, last_read_at from app.thread_reads where user_id = ${userId} and thread_id in (${sql.join(
      rows.map((row) => sql`${row.id}::uuid`),
      sql`, `,
    )})`,
  );
  const readAt = new Map(reads.map((row) => [row.thread_id, new Date(row.last_read_at)]));
  const previews = await previewByThread(db, viewer, rows.map((row) => row.id));
  return rows.map((row) => {
    const incoming = seeker ? row.lastToSeekerAt : row.lastToHostAt;
    const seen = readAt.get(row.id);
    const preview = previews.get(row.id);
    const readOnly =
      row.readOnlyReason !== null ||
      closedLongEnough(row, new Date()) ||
      !orgMayMessage(orgs.get(row.orgId));
    return {
      threadId: row.id,
      listingId: row.listingId,
      listingTitle: titles.get(row.listingId) ?? '',
      counterpartName: seeker
        ? (orgs.get(row.orgId)?.name ?? '')
        : (identities.get(row.seekerUserId)?.firstName ?? ''),
      counterpartAvatarUrl: null,
      lastMessage: preview ? { preview: cutPreview(preview.body), at: preview.at } : null,
      unread: incoming !== null && (seen === undefined || incoming > seen),
      readOnly,
    };
  });
}

async function previewByThread(
  db: DbOrTx,
  viewer: ThreadViewer,
  threadIds: string[],
): Promise<Map<string, { body: string | null; at: string }>> {
  const out = new Map<string, { body: string | null; at: string }>();
  if (threadIds.length === 0) return out;
  const idList = sql.join(
    threadIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const visible =
    viewer.kind === 'seeker'
      ? sql`visible_to = 'all' and scan_state <> 'removed' and (sender_user_id = ${viewer.userId} or scan_state in ('clear', 'warn'))`
      : sql`not (sender_type = 'seeker' and scan_state = 'removed')`;
  const found = await queryRows<{ thread_id: string; body: string | null; created_at: string }>(
    db,
    sql`
      select distinct on (thread_id) thread_id, body, created_at
      from app.messages
      where thread_id in (${idList}) and ${visible}
      order by thread_id, created_at desc
    `,
  );
  for (const row of found) {
    out.set(row.thread_id, { body: row.body, at: new Date(row.created_at).toISOString() });
  }
  return out;
}

export function readOnlyConflict(): never {
  throw conflict(READ_ONLY, { reason: 'read_only' });
}
