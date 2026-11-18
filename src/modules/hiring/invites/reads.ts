// Invite reads for each side (SP5 spec 8.4, plan Task 15). The seeker sees only delivered
// invites (note scan `clear` or `warn`); a pending or held one is 404 everywhere (plan decision
// 20). The host sees every invite of the org on listings in scope, a held one as "Not
// delivered". Both read a `sent` invite past `expires_at` as expired before the sweep runs.
import { and, desc, eq, gt, inArray, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { badRequest, notFound } from '@/lib/errors';
import type {
  HostInviteItem,
  InviteDeclineReason,
  InviteStatus,
  Page,
  SeekerInviteItem,
} from '@/lib/hiring';
import type { JobCardData } from '@/lib/discovery';
import { DELETED_USER } from '@/lib/messaging';
import type { CandidateCard } from '@/lib/profiles';
import { getJobCards } from '@/modules/discovery';
import { getHostIdentities } from '@/modules/hostpages';
import { getHiringInfoMany } from '@/modules/listings';
import { getPublicMediaUrls, getStorage } from '@/modules/media';
import { inScope, listingScope } from '@/modules/messaging';
import { getOrgSummaries } from '@/modules/orgs';
import { getCandidateCards, getCommunityIdentities } from '@/modules/profiles';
import type { HostContext } from '@/server/guards';
import { requireApplicantAccess } from '../pools/gate';
import { invites } from '../schema';
import { DELIVERED, hostInviteStatus, seekerInviteStatus } from './status';

export type InviteRow = typeof invites.$inferSelect;

const PAGE_SIZE = 25;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const INVITE_NOT_FOUND = 'Invite not found';

/** SP4's apply link for an invite (its sibling contract). */
export function applyHref(listingId: string, inviteId: string): string {
  return `/apply/${listingId}?source=invite&invite=${inviteId}`;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const unique = (values: string[]) => [...new Set(values)];

type Cursor = { side: 'h' | 's'; at: string; id: string };

function encodeCursor(c: Cursor): string {
  return Buffer.from(`${c.side}|${c.at}|${c.id}`, 'utf8').toString('base64url');
}

function decodeCursor(raw: string, side: Cursor['side']): Cursor {
  const [s, at, id, ...rest] = Buffer.from(raw, 'base64url').toString('utf8').split('|');
  if (rest.length > 0 || s !== side || !at || Number.isNaN(Date.parse(at)) || !id || !UUID.test(id)) {
    throw badRequest('Invalid cursor', { reason: 'invalid_cursor' });
  }
  return { side, at, id };
}

function after(c: Cursor | null): SQL | undefined {
  return c ? sql`(${invites.sentAt}, ${invites.id}) < (${c.at}::timestamptz, ${c.id}::uuid)` : undefined;
}

function page<T>(rows: InviteRow[], items: Map<string, T>, side: Cursor['side']): Page<T> {
  const shown = rows.slice(0, PAGE_SIZE);
  const last = shown[shown.length - 1];
  return {
    items: shown.flatMap((row) => {
      const item = items.get(row.id);
      return item ? [item] : [];
    }),
    nextCursor:
      rows.length > PAGE_SIZE && last ? encodeCursor({ side, at: last.sentAt.toISOString(), id: last.id }) : null,
  };
}

async function listingTitles(db: DbOrTx, rows: InviteRow[]): Promise<Map<string, string>> {
  const infos = await getHiringInfoMany(db, unique(rows.map((r) => r.listingId)));
  return new Map(infos.map((h) => [h.id, h.title]));
}

/** Host-side items for rows the caller already scoped to the org. */
export async function toHostItems(db: DbOrTx, rows: InviteRow[], now: Date): Promise<Map<string, HostInviteItem>> {
  const out = new Map<string, HostInviteItem>();
  if (rows.length === 0) return out;
  const titles = await listingTitles(db, rows);
  const names = await getCommunityIdentities(db, unique(rows.map((r) => r.seekerUserId)));
  for (const row of rows) {
    const name = names.get(row.seekerUserId);
    out.set(row.id, {
      inviteId: row.id,
      listingId: row.listingId,
      listingTitle: titles.get(row.listingId) ?? '',
      candidateId: row.candidateId,
      firstName: name?.firstName ?? DELETED_USER,
      lastInitial: name?.lastInitial ?? '',
      status: hostInviteStatus(row, now),
      declineReason: (row.declineReason as InviteDeclineReason | null) ?? null,
      sentAt: row.sentAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      respondedAt: iso(row.respondedAt),
      threadId: row.threadId,
    });
  }
  return out;
}

/** Seeker-side items for rows the caller already limited to the seeker's delivered invites. */
export async function toSeekerItems(
  db: DbOrTx,
  rows: InviteRow[],
  now: Date,
): Promise<Map<string, SeekerInviteItem>> {
  const out = new Map<string, SeekerInviteItem>();
  if (rows.length === 0) return out;
  const orgIds = unique(rows.map((r) => r.orgId));
  const titles = await listingTitles(db, rows);
  const orgs = await getOrgSummaries(db, orgIds);
  const hosts = await getHostIdentities(db, orgIds);
  const logoIds = [...hosts.values()].flatMap((h) => (h.logoMediaId ? [h.logoMediaId] : []));
  const logos = logoIds.length > 0 ? await getPublicMediaUrls(db, getStorage(), logoIds, 320) : new Map<string, string>();
  for (const row of rows) {
    const logoId = hosts.get(row.orgId)?.logoMediaId ?? null;
    out.set(row.id, {
      inviteId: row.id,
      listingId: row.listingId,
      orgId: row.orgId,
      orgName: orgs.get(row.orgId)?.name ?? hosts.get(row.orgId)?.name ?? '',
      orgLogoUrl: logoId ? (logos.get(logoId) ?? null) : null,
      title: titles.get(row.listingId) ?? '',
      note: row.note,
      warn: row.scanState === 'warn',
      status: seekerInviteStatus(row, now),
      sentAt: row.sentAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      threadId: row.threadId,
      applyHref: applyHref(row.listingId, row.id),
    });
  }
  return out;
}

/** The org's invites by ID (W3's card payloads). */
export async function hostInviteItems(
  db: DbOrTx,
  orgId: string,
  inviteIds: string[],
  now: Date = new Date(),
): Promise<Map<string, HostInviteItem>> {
  if (inviteIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(invites)
    .where(and(eq(invites.orgId, orgId), inArray(invites.id, inviteIds)));
  return toHostItems(db, rows, now);
}

/** The seeker's own delivered invites by ID (W3's card payloads). */
export async function seekerInviteItems(
  db: DbOrTx,
  seekerUserId: string,
  inviteIds: string[],
  now: Date = new Date(),
): Promise<Map<string, SeekerInviteItem>> {
  if (inviteIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(invites)
    .where(
      and(
        eq(invites.seekerUserId, seekerUserId),
        inArray(invites.id, inviteIds),
        inArray(invites.scanState, [...DELIVERED]),
      ),
    );
  return toSeekerItems(db, rows, now);
}

function hostStatusClause(status: InviteStatus | undefined, now: Date): SQL | undefined {
  if (!status) return undefined;
  if (status === 'sent') {
    return and(eq(invites.status, 'sent'), ne(invites.scanState, 'held'), gt(invites.expiresAt, now));
  }
  if (status === 'expired') {
    return and(
      ne(invites.scanState, 'held'),
      or(eq(invites.status, 'expired'), and(eq(invites.status, 'sent'), lte(invites.expiresAt, now))),
    );
  }
  return eq(invites.status, status);
}

/** The org's invites on listings in scope, newest first, keyset-paged. */
export async function listHostInvites(
  db: DbOrTx,
  ctx: HostContext,
  q: { listingId?: string; status?: InviteStatus; cursor?: string },
  now: Date = new Date(),
): Promise<Page<HostInviteItem>> {
  await requireApplicantAccess(db, ctx.orgId);
  const cursor = q.cursor ? decodeCursor(q.cursor, 'h') : null;
  const scope = await listingScope(db, ctx);
  if (q.listingId && !inScope(scope, q.listingId)) throw notFound('Listing not found');
  if (!scope.all && scope.listingIds.length === 0) return { items: [], nextCursor: null };
  const rows = await db
    .select()
    .from(invites)
    .where(
      and(
        eq(invites.orgId, ctx.orgId),
        scope.all ? undefined : inArray(invites.listingId, scope.listingIds),
        q.listingId ? eq(invites.listingId, q.listingId) : undefined,
        hostStatusClause(q.status, now),
        after(cursor),
      ),
    )
    .orderBy(desc(invites.sentAt), desc(invites.id))
    .limit(PAGE_SIZE + 1);
  return page(rows, await toHostItems(db, rows.slice(0, PAGE_SIZE), now), 'h');
}

/** The seeker's delivered invites, newest first, keyset-paged. */
export async function listSeekerInvites(
  db: DbOrTx,
  seekerUserId: string,
  o: { cursor?: string } = {},
  now: Date = new Date(),
): Promise<Page<SeekerInviteItem>> {
  const cursor = o.cursor ? decodeCursor(o.cursor, 's') : null;
  const rows = await db
    .select()
    .from(invites)
    .where(
      and(eq(invites.seekerUserId, seekerUserId), inArray(invites.scanState, [...DELIVERED]), after(cursor)),
    )
    .orderBy(desc(invites.sentAt), desc(invites.id))
    .limit(PAGE_SIZE + 1);
  return page(rows, await toSeekerItems(db, rows.slice(0, PAGE_SIZE), now), 's');
}

/** One delivered invite of the seeker's, with the job card while the listing is live. */
export async function getSeekerInvite(
  db: DbOrTx,
  seekerUserId: string,
  inviteId: string,
  now: Date = new Date(),
): Promise<{ invite: SeekerInviteItem; jobCard: JobCardData | null }> {
  const invite = (await seekerInviteItems(db, seekerUserId, [inviteId], now)).get(inviteId);
  if (!invite) throw notFound(INVITE_NOT_FOUND);
  const [listing] = await getHiringInfoMany(db, [invite.listingId]);
  const jobCard =
    listing?.status === 'active'
      ? ((await getJobCards(db, [invite.listingId], { viewerUserId: seekerUserId }))[0] ?? null)
      : null;
  return { invite, jobCard };
}

/**
 * The candidate behind an Interested (or Applied) invite, at SP4's `interested` stage: full
 * name and contacts, no work authorization (plan decision 16). 404 unless the invite is the
 * org's, on a listing in scope, answered Interested, and SP4 still returns the card (a reveal
 * exists and neither side blocked the other). The photo shows only if the seeker allows it.
 */
export async function getInterestedCandidate(
  db: DbOrTx,
  ctx: HostContext,
  inviteId: string,
  now: Date = new Date(),
): Promise<{ invite: HostInviteItem; candidate: CandidateCard }> {
  const [row] = await db.select().from(invites).where(eq(invites.id, inviteId));
  if (!row || row.orgId !== ctx.orgId) throw notFound(INVITE_NOT_FOUND);
  if (!inScope(await listingScope(db, ctx), row.listingId)) throw notFound(INVITE_NOT_FOUND);
  if (row.status !== 'interested' && row.status !== 'applied') throw notFound(INVITE_NOT_FOUND);
  await requireApplicantAccess(db, ctx.orgId);
  const cards = await getCandidateCards(db, {
    orgId: ctx.orgId,
    seekerUserIds: [row.seekerUserId],
    stage: 'interested',
  });
  const found = cards.find((c) => c.stage === 'interested' && c.card.seekerUserId === row.seekerUserId);
  if (!found || found.stage !== 'interested') throw notFound(INVITE_NOT_FOUND);
  const invite = (await toHostItems(db, [row], now)).get(row.id);
  if (!invite) throw notFound(INVITE_NOT_FOUND);
  const candidate: CandidateCard = {
    ...found,
    card: { ...found.card, avatarMediaId: found.profile.avatarMediaId },
  };
  return { invite, candidate };
}
