// The candidates API (SP5 spec 8.2 and 5, plan Task 13). Each page is rendered through SP4's
// `getCandidateCards` at stage `pool`, so a seeker who turned visibility off, became ineligible
// or blocked the org either way is gone on the next load. The only filters are state,
// available-by and skills (no protected trait, P0 item 13). Pool cards never carry a photo: it
// appears only after an application or an Interested answer (legal review 2.2 item 5).
import { and, asc, eq, inArray, isNotNull, isNull, lte, sql, type SQL } from 'drizzle-orm';
import type { Db, DbOrTx } from '@/lib/db';
import { badRequest, isAppError, notFound } from '@/lib/errors';
import { POOL, type CandidatesQuery, type FitLine, type FitResult, type HostInviteStatus, type PoolCardData } from '@/lib/hiring';
import { getBalance } from '@/modules/entitlements';
import { normalizeSkill, type ListingHiringInfo } from '@/modules/listings';
import { getPublicMediaUrls, getStorage } from '@/modules/media';
import { getCandidateCards } from '@/modules/profiles';
import type { HostContext } from '@/server/guards';
import { requireListing } from '../access';
import { fitAvailable } from '../fit/score';
import { FIT_WEIGHTS_VERSION } from '../fit/weights';
import { hostInviteStatus } from '../invites/status';
import { candidatePoolEntries, candidatePoolRuns, invites } from '../schema';
import { requireApplicantAccess } from './gate';
import { applicantSeekerIds, refreshPool } from './refresh';

const HOUR_MS = 3_600_000;
const NO_DATE = '9999-12-31';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CANDIDATE_NOT_FOUND = 'Candidate not found';

type View = CandidatesQuery['view'];
type Cursor = { l: string; v: View; f: 0 | 1; r: number; d: string; id: string };

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

/** A cursor is bound to its listing, view and fit mode; anything else is a 400. */
function decodeCursor(raw: string, expect: { listingId: string; view: View; fitOn: boolean }): Cursor {
  let c: Partial<Cursor> | null = null;
  try {
    c = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<Cursor>;
  } catch {
    c = null;
  }
  if (
    !c ||
    c.l !== expect.listingId ||
    c.v !== expect.view ||
    c.f !== (expect.fitOn ? 1 : 0) ||
    typeof c.r !== 'number' ||
    !Number.isInteger(c.r) ||
    typeof c.d !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(c.d) ||
    typeof c.id !== 'string' ||
    !UUID.test(c.id)
  ) {
    throw badRequest('Invalid cursor', { reason: 'invalid_cursor' });
  }
  return c as Cursor;
}

async function loadRun(db: DbOrTx, listingId: string) {
  const [run] = await db.select().from(candidatePoolRuns).where(eq(candidatePoolRuns.listingId, listingId));
  return run ?? null;
}

/** Refreshes when the run is missing, older than 6 hours, or on another revision or weights. */
async function refreshIfStale(db: Db, h: ListingHiringInfo, now: Date): Promise<void> {
  if (!h.publishedRevisionId) return;
  const run = await loadRun(db, h.id);
  const stale =
    !run ||
    now.getTime() - run.computedAt.getTime() > POOL.refreshAfterHours * HOUR_MS ||
    run.listingRevisionId !== h.publishedRevisionId ||
    run.weightsVersion !== FIT_WEIGHTS_VERSION;
  if (stale) await refreshPool(db, h, now);
}

/** Fit is off for this listing: drop any score a refresh stored while it was on. */
async function clearScores(db: Db, listingId: string): Promise<void> {
  await db
    .update(candidatePoolEntries)
    .set({ fitScore: null, fitLines: null })
    .where(and(eq(candidatePoolEntries.listingId, listingId), isNotNull(candidatePoolEntries.fitLines)));
}

function viewClause(view: View): SQL {
  if (view === 'saved') return isNotNull(candidatePoolEntries.savedAt) as SQL;
  if (view === 'hidden') return isNotNull(candidatePoolEntries.hiddenAt) as SQL;
  return isNull(candidatePoolEntries.hiddenAt) as SQL;
}

function textArray(values: readonly string[]): SQL {
  return sql`array[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::text[]`;
}

async function inviteStatuses(
  db: DbOrTx,
  listingId: string,
  seekerUserIds: string[],
  now: Date,
): Promise<Map<string, { inviteId: string; status: HostInviteStatus }>> {
  const out = new Map<string, { inviteId: string; status: HostInviteStatus }>();
  if (seekerUserIds.length === 0) return out;
  const rows = await db
    .select({
      id: invites.id,
      seekerUserId: invites.seekerUserId,
      status: invites.status,
      scanState: invites.scanState,
      expiresAt: invites.expiresAt,
    })
    .from(invites)
    .where(and(eq(invites.listingId, listingId), inArray(invites.seekerUserId, seekerUserIds)));
  for (const row of rows) out.set(row.seekerUserId, { inviteId: row.id, status: hostInviteStatus(row, now) });
  return out;
}

async function coverUrls(db: DbOrTx, ids: (string | null)[]): Promise<Map<string, string>> {
  const wanted = ids.filter((id): id is string => id !== null);
  if (wanted.length === 0) return new Map();
  return getPublicMediaUrls(db, getStorage(), wanted, 640);
}

export async function listCandidates(
  db: Db,
  ctx: HostContext,
  i: CandidatesQuery & { listingId: string },
  now: Date = new Date(),
): Promise<{ items: PoolCardData[]; nextCursor: string | null; creditsRemaining: number; fitAvailable: boolean }> {
  const h = await requireListing(db, ctx, i.listingId);
  await requireApplicantAccess(db, ctx.orgId);
  const view = i.view;
  const fitOn = await fitAvailable(db, h);
  const cursor = i.cursor ? decodeCursor(i.cursor, { listingId: h.id, view, fitOn }) : null;
  if (!cursor) await refreshIfStale(db, h, now);
  if (!fitOn) await clearScores(db, h.id);

  const rank = sql<number>`(100 - coalesce(${candidatePoolEntries.fitScore}, -1))`;
  const avail = sql<string>`coalesce(${candidatePoolEntries.availableFrom}, ${NO_DATE}::date)`;
  const skills = [...new Set((i.skills ?? []).map((s) => normalizeSkill(s).key).filter((k) => k !== ''))];
  const after = cursor
    ? fitOn
      ? sql`(${rank}, ${avail}, ${candidatePoolEntries.id}) > (${cursor.r}::int, ${cursor.d}::date, ${cursor.id}::uuid)`
      : sql`(${avail}, ${candidatePoolEntries.id}) > (${cursor.d}::date, ${cursor.id}::uuid)`
    : undefined;

  const rows = await db
    .select({
      id: candidatePoolEntries.id,
      seekerUserId: candidatePoolEntries.seekerUserId,
      fitScore: candidatePoolEntries.fitScore,
      fitLines: candidatePoolEntries.fitLines,
      savedAt: candidatePoolEntries.savedAt,
      hiddenAt: candidatePoolEntries.hiddenAt,
      rank: sql<number>`${rank}`.mapWith(Number),
      avail: sql<string>`${avail}::text`,
    })
    .from(candidatePoolEntries)
    .where(
      and(
        eq(candidatePoolEntries.listingId, h.id),
        eq(candidatePoolEntries.eligible, true),
        viewClause(view),
        i.state ? eq(candidatePoolEntries.state, i.state.toUpperCase()) : undefined,
        i.availableBy ? lte(candidatePoolEntries.availableFrom, i.availableBy) : undefined,
        skills.length > 0 ? sql`${candidatePoolEntries.skillsNorm} @> ${textArray(skills)}` : undefined,
        after,
      ),
    )
    .orderBy(...(fitOn ? [asc(rank), asc(avail), asc(candidatePoolEntries.id)] : [asc(avail), asc(candidatePoolEntries.id)]))
    .limit(POOL.pageSize + 1);

  const page = rows.slice(0, POOL.pageSize);
  const last = page[page.length - 1];
  const seekerIds = page.map((row) => row.seekerUserId);
  const applicants = await applicantSeekerIds(db, h.id, seekerIds);
  const visible = seekerIds.filter((id) => !applicants.has(id));
  const cards = visible.length
    ? await getCandidateCards(db, { orgId: ctx.orgId, seekerUserIds: visible, stage: 'pool' })
    : [];
  const byId = new Map(cards.map((c) => [c.card.seekerUserId, c.card]));
  const inviteBySeeker = await inviteStatuses(db, h.id, seekerIds, now);
  const covers = await coverUrls(
    db,
    cards.map((c) => c.card.coverMediaId),
  );
  const run = fitOn ? await loadRun(db, h.id) : null;

  const items: PoolCardData[] = page.flatMap((row) => {
    const card = byId.get(row.seekerUserId);
    if (!card || applicants.has(row.seekerUserId)) return [];
    const fit: FitResult | null =
      fitOn && row.fitScore !== null && Array.isArray(row.fitLines)
        ? { score: row.fitScore, weightsVersion: run?.weightsVersion ?? FIT_WEIGHTS_VERSION, lines: row.fitLines as FitLine[] }
        : null;
    return [
      {
        candidateId: row.id,
        card: { ...card, avatarMediaId: null },
        avatarUrl: null,
        coverUrl: card.coverMediaId ? (covers.get(card.coverMediaId) ?? null) : null,
        fit,
        invite: inviteBySeeker.get(row.seekerUserId) ?? null,
        saved: row.savedAt !== null,
        hidden: row.hiddenAt !== null,
      },
    ];
  });

  const { balance } = await getBalance(db, ctx.orgId, 'invite_credit');
  return {
    items,
    nextCursor:
      rows.length > POOL.pageSize && last
        ? encodeCursor({ l: h.id, v: view, f: fitOn ? 1 : 0, r: fitOn ? last.rank : 0, d: last.avail, id: last.id })
        : null,
    creditsRemaining: balance,
    fitAvailable: fitOn,
  };
}

export async function setCandidateFlag(
  db: Db,
  ctx: HostContext,
  candidateId: string,
  flag: 'saved' | 'hidden',
  on: boolean,
): Promise<void> {
  const [entry] = await db
    .select({ id: candidatePoolEntries.id, orgId: candidatePoolEntries.orgId, listingId: candidatePoolEntries.listingId })
    .from(candidatePoolEntries)
    .where(eq(candidatePoolEntries.id, candidateId));
  if (!entry || entry.orgId !== ctx.orgId) throw notFound(CANDIDATE_NOT_FOUND);
  await requireListing(db, ctx, entry.listingId).catch((err: unknown) => {
    throw isAppError(err) && err.code === 'not_found' ? notFound(CANDIDATE_NOT_FOUND) : err;
  });
  const at = on ? new Date() : null;
  await db
    .update(candidatePoolEntries)
    .set(flag === 'saved' ? { savedAt: at } : { hiddenAt: at })
    .where(eq(candidatePoolEntries.id, entry.id));
}
