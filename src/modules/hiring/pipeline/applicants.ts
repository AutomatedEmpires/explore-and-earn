// Applicant list, detail, and the ids a bulk message can address.
//
// The list and detail are refused while the host is not verified (./gate.ts). A stored fit
// score shows, and sort=fit orders by it, only on a listing whose fit is on now (spec 8.3):
// the stored value can outlive the switch, because the daily refresh skips listings that are
// not live and finished applicants. Where fit is off, sort=fit falls back to newest first.
import { and, asc, desc, eq, inArray, lt, or, sql, type SQL } from 'drizzle-orm';
import type { ApplicationSource, ApplicationStatus, HostApplicationCard } from '@/lib/applications';
import { APPLICATION_STATUSES } from '@/lib/applications';
import { badRequest, notFound } from '@/lib/errors';
import type { ApplicantsQuery } from '@/lib/hiring';
import { APPLICATION_UNAVAILABLE } from '@/lib/hiring';
import type {
  ApplicantCardData,
  ApplicantDetail,
  FitLine,
  FitResult,
  InterviewStatus,
  OfferStatus,
} from '@/lib/hiring/types';
import type { DbOrTx } from '@/lib/db';
import { getHostCards, getSnapshot } from '@/modules/applications';
import { getPublicMediaUrls, getStorage } from '@/modules/media';
import { getHiringInfoMany, type ListingHiringInfo } from '@/modules/listings';
import { inScope, listingScope, threadIdsForApplications, type ListingScope } from '@/modules/messaging';
import type { HostContext } from '@/server/guards';
import { requireEntry } from '../access';
import type { PipelineEntryRow } from '../core';
import { fitAvailable } from '../fit/score';
import { hostInterviewViews } from '../interviews/reads';
import { hostOfferViews } from '../offers/offers';
import { pendingPasses, pipelineEntries, pipelineEvents } from '../schema';
import { requireApplicantReads } from './gate';

type Cursor =
  | { sort: 'newest'; appliedAt: string; id: string }
  | { sort: 'oldest'; appliedAt: string; id: string }
  | { sort: 'activity'; lastStatusAt: string; id: string }
  | { sort: 'fit'; fitScore: number | null; appliedAt: string; id: string };

function zeroCounts(): Record<ApplicationStatus, number> {
  return Object.fromEntries(APPLICATION_STATUSES.map((status) => [status, 0])) as Record<
    ApplicationStatus,
    number
  >;
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeCursor(cursor: string, sort: ApplicantsQuery['sort']): Cursor {
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Cursor;
    if (value.sort !== sort || typeof value.id !== 'string') throw new Error('bad cursor');
    return value;
  } catch {
    throw badRequest('Invalid cursor');
  }
}

function scopeSql(scope: ListingScope): SQL | undefined {
  if (scope.all) return undefined;
  return inArray(pipelineEntries.listingId, scope.listingIds);
}

function sqlOf(value: SQL | undefined): SQL {
  if (!value) throw new Error('Expected a SQL condition');
  return value;
}

/** The listings among `infos` whose fit is on now. */
async function fitOnListings(db: DbOrTx, infos: ListingHiringInfo[]): Promise<Set<string>> {
  const on = await Promise.all(infos.map(async (h) => ((await fitAvailable(db, h)) ? [h.id] : [])));
  return new Set(on.flat());
}

/** The score sort=fit orders by: the stored one on a listing in `fitOn`, otherwise null. */
function shownFitSql(fitOn: ReadonlySet<string>): SQL {
  if (fitOn.size === 0) return sql`null::smallint`;
  return sql`(case when ${inArray(pipelineEntries.listingId, [...fitOn])} then ${pipelineEntries.fitScore} end)`;
}

function shownFit(row: PipelineEntryRow, fitOn: ReadonlySet<string>): number | null {
  return fitOn.has(row.listingId) ? row.fitScore : null;
}

function cursorSql(cursor: Cursor, fit: SQL): SQL {
  if (cursor.sort === 'newest') {
    const at = new Date(cursor.appliedAt);
    return sqlOf(
      or(
        lt(pipelineEntries.appliedAt, at),
        and(eq(pipelineEntries.appliedAt, at), lt(pipelineEntries.applicationId, cursor.id)),
      ),
    );
  }
  if (cursor.sort === 'oldest') {
    const at = new Date(cursor.appliedAt);
    return sqlOf(
      or(
        sql`${pipelineEntries.appliedAt} > ${at}`,
        and(eq(pipelineEntries.appliedAt, at), sql`${pipelineEntries.applicationId} > ${cursor.id}`),
      ),
    );
  }
  if (cursor.sort === 'activity') {
    const at = new Date(cursor.lastStatusAt);
    return sqlOf(
      or(
        lt(pipelineEntries.lastStatusAt, at),
        and(eq(pipelineEntries.lastStatusAt, at), lt(pipelineEntries.applicationId, cursor.id)),
      ),
    );
  }
  const at = new Date(cursor.appliedAt);
  const sameScore = sql`${fit} is not distinct from ${cursor.fitScore}`;
  const earlier = sqlOf(
    or(
      lt(pipelineEntries.appliedAt, at),
      and(eq(pipelineEntries.appliedAt, at), lt(pipelineEntries.applicationId, cursor.id)),
    ),
  );
  if (cursor.fitScore === null) return sqlOf(and(sql`${fit} is null`, earlier));
  return sqlOf(or(sql`${fit} < ${cursor.fitScore}`, sql`${fit} is null`, and(sameScore, earlier)));
}

function orderBy(sort: ApplicantsQuery['sort'], fit: SQL): SQL[] {
  if (sort === 'oldest') return [asc(pipelineEntries.appliedAt), asc(pipelineEntries.applicationId)];
  if (sort === 'activity') return [desc(pipelineEntries.lastStatusAt), desc(pipelineEntries.applicationId)];
  if (sort === 'fit') {
    // With no score shown this is newest first.
    return [sql`${fit} desc nulls last`, desc(pipelineEntries.appliedAt), desc(pipelineEntries.applicationId)];
  }
  return [desc(pipelineEntries.appliedAt), desc(pipelineEntries.applicationId)];
}

function nextCursor(sort: ApplicantsQuery['sort'], row: PipelineEntryRow, fitOn: ReadonlySet<string>): string {
  if (sort === 'activity') {
    return encodeCursor({ sort, lastStatusAt: row.lastStatusAt.toISOString(), id: row.applicationId });
  }
  if (sort === 'fit') {
    return encodeCursor({
      sort,
      fitScore: shownFit(row, fitOn),
      appliedAt: row.appliedAt.toISOString(),
      id: row.applicationId,
    });
  }
  if (sort === 'oldest') {
    return encodeCursor({ sort, appliedAt: row.appliedAt.toISOString(), id: row.applicationId });
  }
  return encodeCursor({ sort: 'newest', appliedAt: row.appliedAt.toISOString(), id: row.applicationId });
}

function storedFit(entry: PipelineEntryRow): FitResult | null {
  if (entry.fitScore === null) return null;
  const lines = Array.isArray(entry.fitLines) ? (entry.fitLines as FitLine[]) : [];
  return { score: entry.fitScore, weightsVersion: entry.fitWeightsVersion ?? '', lines };
}

/** Cards for `rows`. `fitOn` is the listings whose fit is on; it is read when not given. */
async function toCards(
  db: DbOrTx,
  ctx: HostContext,
  rows: PipelineEntryRow[],
  fitOn?: ReadonlySet<string>,
): Promise<ApplicantCardData[]> {
  if (rows.length === 0) return [];
  const applicationIds = rows.map((row) => row.applicationId);
  const listingIds = [...new Set(rows.map((row) => row.listingId))];
  const [cards, listings, threads, passes] = await Promise.all([
    getHostCards(db, { orgId: ctx.orgId, applicationIds }),
    getHiringInfoMany(db, listingIds),
    threadIdsForApplications(db, applicationIds),
    db.select().from(pendingPasses).where(inArray(pendingPasses.applicationId, applicationIds)),
  ]);
  const shown = fitOn ?? (await fitOnListings(db, listings));
  const cardById = new Map(cards.map((card) => [card.applicationId, card]));
  const titleById = new Map(listings.map((listing) => [listing.id, listing.title]));
  const undoById = new Map(passes.map((row) => [row.applicationId, row.commitAt.toISOString()]));
  const mediaIds = cards.flatMap((card) =>
    [card.avatarMediaId, card.coverMediaId].filter((id): id is string => id !== null),
  );
  const urls =
    mediaIds.length > 0 ? await getPublicMediaUrls(db, getStorage(), mediaIds, 640) : new Map<string, string>();

  const items: ApplicantCardData[] = [];
  for (const row of rows) {
    const card = cardById.get(row.applicationId);
    if (!card) continue;
    items.push(cardItem(row, card, titleById.get(row.listingId) ?? '', urls, undoById, threads, shown));
  }
  return items;
}

function cardItem(
  row: PipelineEntryRow,
  card: HostApplicationCard,
  listingTitle: string,
  urls: Map<string, string>,
  undoById: Map<string, string>,
  threads: Map<string, string>,
  fitOn: ReadonlySet<string>,
): ApplicantCardData {
  return {
    applicationId: row.applicationId,
    listingId: row.listingId,
    listingTitle,
    status: row.status as ApplicationStatus,
    source: row.source as ApplicationSource,
    appliedAt: row.appliedAt.toISOString(),
    lastStatusAt: row.lastStatusAt.toISOString(),
    card,
    avatarUrl: card.avatarMediaId ? (urls.get(card.avatarMediaId) ?? null) : null,
    coverUrl: card.coverMediaId ? (urls.get(card.coverMediaId) ?? null) : null,
    fitScore: shownFit(row, fitOn),
    interviewState: (row.interviewState as InterviewStatus | null) ?? null,
    offerState: (row.offerState as OfferStatus | null) ?? null,
    undoUntil: undoById.get(row.applicationId) ?? null,
    threadId: threads.get(row.applicationId) ?? null,
  };
}

export async function listApplicants(
  db: DbOrTx,
  ctx: HostContext,
  q: ApplicantsQuery,
): Promise<{ items: ApplicantCardData[]; counts: Record<ApplicationStatus, number>; nextCursor: string | null }> {
  await requireApplicantReads(db, ctx.orgId);
  const scope = await listingScope(db, ctx);
  if (q.listingId && !inScope(scope, q.listingId)) throw notFound('Listing not found');
  const counts = zeroCounts();
  if (!scope.all && scope.listingIds.length === 0) return { items: [], counts, nextCursor: null };

  const base = and(
    eq(pipelineEntries.orgId, ctx.orgId),
    scopeSql(scope),
    q.listingId ? eq(pipelineEntries.listingId, q.listingId) : undefined,
  );
  const counted = await db
    .select({ status: pipelineEntries.status, n: sql<number>`count(*)::int` })
    .from(pipelineEntries)
    .where(base)
    .groupBy(pipelineEntries.status);
  for (const row of counted) {
    const status = row.status as ApplicationStatus;
    if (status in counts) counts[status] = Number(row.n);
  }

  const cursor = q.cursor ? decodeCursor(q.cursor, q.sort) : undefined;
  // sort=fit orders by the shown score, so it needs fit for every listing the filter covers.
  let fitOn: Set<string> | undefined;
  if (q.sort === 'fit') {
    fitOn = await fitOnListings(db, await getHiringInfoMany(db, await listingIdsOf(db, base, q)));
  }
  const fit = shownFitSql(fitOn ?? new Set());
  const rows = await db
    .select()
    .from(pipelineEntries)
    .where(
      and(
        base,
        q.status && q.status.length > 0 ? inArray(pipelineEntries.status, q.status) : undefined,
        cursor ? cursorSql(cursor, fit) : undefined,
      ),
    )
    .orderBy(...orderBy(q.sort, fit))
    .limit(q.limit + 1);
  const page = rows.slice(0, q.limit);
  const more = rows.length > q.limit;
  const last = page.at(-1);
  return {
    items: await toCards(db, ctx, page, fitOn),
    counts,
    nextCursor: more && last ? nextCursor(q.sort, last, fitOn ?? new Set()) : null,
  };
}

async function listingIdsOf(db: DbOrTx, base: SQL | undefined, q: ApplicantsQuery): Promise<string[]> {
  if (q.listingId) return [q.listingId];
  const rows = await db.selectDistinct({ listingId: pipelineEntries.listingId }).from(pipelineEntries).where(base);
  return rows.map((row) => row.listingId);
}

export async function getApplicantDetail(
  db: DbOrTx,
  ctx: HostContext,
  applicationId: string,
): Promise<ApplicantDetail> {
  await requireApplicantReads(db, ctx.orgId);
  const entry = await requireEntry(db, ctx, applicationId);
  const snapshot = await getSnapshot(db, { orgId: ctx.orgId, applicationId });
  if (!snapshot) throw notFound(APPLICATION_UNAVAILABLE);
  const [items, history, interviews, offers] = await Promise.all([
    toCards(db, ctx, [entry]),
    db
      .select()
      .from(pipelineEvents)
      .where(eq(pipelineEvents.applicationId, applicationId))
      .orderBy(asc(pipelineEvents.occurredAt), asc(pipelineEvents.id)),
    hostInterviewViews(db, [applicationId]),
    hostOfferViews(db, [applicationId]),
  ]);
  const card = items[0];
  if (!card) throw notFound(APPLICATION_UNAVAILABLE);
  return {
    card,
    snapshot,
    // The card's score is null whenever fit is off for the listing; the full result follows it.
    fit: card.fitScore === null ? null : storedFit(entry),
    history: history.map((event) => ({
      kind: event.kind as ApplicantDetail['history'][number]['kind'],
      actorType: event.actorType as 'host' | 'seeker' | 'system',
      at: event.occurredAt.toISOString(),
    })),
    interview: interviews.get(applicationId) ?? null,
    offer: offers.get(applicationId) ?? null,
    threadId: card.threadId,
    additionalStepDone: entry.additionalStepDone,
  };
}

export async function listApplicationIdsByStatus(
  db: DbOrTx,
  i: { orgId: string; listingId: string; statuses: ApplicationStatus[] },
): Promise<string[]> {
  const statuses = i.statuses.filter((status) => status !== 'withdrawn');
  if (statuses.length === 0) return [];
  const rows = await db
    .select({ applicationId: pipelineEntries.applicationId })
    .from(pipelineEntries)
    .where(
      and(
        eq(pipelineEntries.orgId, i.orgId),
        eq(pipelineEntries.listingId, i.listingId),
        inArray(pipelineEntries.status, statuses),
      ),
    );
  return rows.map((row) => row.applicationId);
}
