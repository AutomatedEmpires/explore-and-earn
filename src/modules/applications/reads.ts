// The seeker's reads: the apply context, My jobs lists and receipts; and the operator count (SP4
// spec 3.2 and 5; plan Task 22).
//
// Lists and receipts are scoped to the seeker and render from the frozen snapshot only: no SP2
// call, so a listing that closed or was removed after the seeker applied never 404s them.
import { and, eq, gte, sql, type SQL } from 'drizzle-orm';
import { queryRows, type DbOrTx } from '@/lib/db';
import {
  APPLICATION_LIMITS,
  APPLICATION_STATUSES,
  seekerStatus,
  type ApplicationStatus,
  type ApplicationView,
  type ApplyContextDto,
  type MyApplicationRow,
  type ReceiptDto,
} from '@/lib/applications';
import { badRequest, notFound } from '@/lib/errors';
import { canAcceptApplications, getListingSummaries, getRevision } from '@/modules/listings';
import { buildProfileSnapshot, getOwnProfile } from '@/modules/profiles';
import { isBlockedBetween } from '@/modules/safety';
import { buildReceipt } from './receipt';
import { applications } from './schema';
import { loadListingFacts, minimizeProfile, missingFields } from './snapshot';

const MAX_PAGE = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_MICROS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

/** Which statuses each My jobs view lists (spec 8.5): everything else is Applied. */
const VIEW_STATUSES: Record<ApplicationView, readonly ApplicationStatus[]> = {
  interviews: ['interviewing'],
  offers: ['offered'],
  applied: APPLICATION_STATUSES.filter((s) => s !== 'interviewing' && s !== 'offered'),
};

const textList = (values: readonly string[]): SQL =>
  sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  );

/**
 * What the apply page needs. The listing reads `closed` whenever it takes no applications
 * (closed, paused, past its deadline, or the host is inactive); its content then comes from
 * the last published revision. A listing that is unknown, removed or never published is 404.
 */
export async function getApplyContext(
  db: DbOrTx,
  seekerUserId: string,
  listingId: string,
): Promise<ApplyContextDto> {
  const accepting = await canAcceptApplications(db, listingId);
  let revisionId: string;
  if (accepting.ok) {
    revisionId = accepting.revisionId;
  } else {
    const summary = (await getListingSummaries(db, [listingId])).get(listingId);
    if (!summary || summary.state === 'removed' || !summary.publishedRevisionId) {
      throw notFound('Listing not found');
    }
    revisionId = summary.publishedRevisionId;
  }
  const published = await getRevision(db, revisionId);

  const [existing] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(and(eq(applications.listingId, listingId), eq(applications.seekerUserId, seekerUserId)));
  const blocks = await isBlockedBetween(
    db,
    { type: 'user', id: seekerUserId },
    { type: 'org', id: published.orgId },
  );
  const profile = await buildProfileSnapshot(db, seekerUserId, { includeWorkAuthorization: true });
  const { resume } = await getOwnProfile(db, seekerUserId);

  return {
    listing: {
      ...(await loadListingFacts(db, published)),
      status: accepting.ok ? 'active' : 'closed',
    },
    questions: published.content.applying.questions,
    sponsorshipWarning:
      published.content.job.visaSponsorship === 'none' &&
      profile.workAuthorization?.status === 'needs_sponsorship',
    blocked: blocks.byA ? 'you_blocked' : blocks.byB ? 'unavailable' : 'none',
    existingApplicationId: existing?.id ?? null,
    missingFields: missingFields(profile),
    // Exactly what the host would receive: work authorization as the two answers only.
    preview: minimizeProfile(profile),
    resume: { mode: resume.mode },
  };
}

type Cursor = { view: ApplicationView; at: string; id: string };

function encodeCursor(c: Cursor): string {
  return Buffer.from(`${c.view}|${c.at}|${c.id}`, 'utf8').toString('base64url');
}

/** A cursor is bound to its view: one from another view, or a malformed one, is a 400. */
function decodeCursor(raw: string, view: ApplicationView): Cursor {
  const [v, at, id, ...rest] = Buffer.from(raw, 'base64url').toString('utf8').split('|');
  if (rest.length > 0 || v !== view || !at || !id || !ISO_MICROS.test(at) || !UUID.test(id)) {
    throw badRequest('Invalid cursor', { reason: 'invalid_cursor' });
  }
  return { view, at, id };
}

type ListRow = {
  applicationId: string;
  listingId: string;
  status: ApplicationStatus;
  title: string | null;
  orgName: string | null;
  orgLogoMediaId: string | null;
  at: string;
};

/** `counts` is additive, for the Profile hub's rows. Newest first, keyset-paged. */
export async function listMyApplications(
  db: DbOrTx,
  seekerUserId: string,
  i: { view: ApplicationView; before?: string; limit?: number },
): Promise<{
  items: MyApplicationRow[];
  nextBefore: string | null;
  counts: Record<ApplicationView, number>;
}> {
  const limit = Math.min(Math.max(i.limit ?? APPLICATION_LIMITS.pageSize, 1), MAX_PAGE);
  const cursor = i.before ? decodeCursor(i.before, i.view) : null;

  const rows = await queryRows<ListRow>(
    db,
    sql`select id::text as "applicationId", listing_id::text as "listingId", status,
        snapshot->'listing'->>'title' as title,
        snapshot->'listing'->>'orgName' as "orgName",
        snapshot->'listing'->>'orgLogoMediaId' as "orgLogoMediaId",
        to_char(submitted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as at
      from app.applications
      where seeker_user_id = ${seekerUserId}::uuid
        and status in (${textList(VIEW_STATUSES[i.view])})
        ${
          cursor
            ? sql`and (submitted_at, id) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)`
            : sql``
        }
      order by submitted_at desc, id desc
      limit ${limit + 1}`,
  );
  const page = rows.slice(0, limit);
  const last = page.at(-1);

  const [counted] = await queryRows<Record<ApplicationView, number>>(
    db,
    sql`select
        count(*) filter (where status = 'interviewing')::int as interviews,
        count(*) filter (where status = 'offered')::int as offers,
        count(*) filter (where status not in ('interviewing', 'offered'))::int as applied
      from app.applications where seeker_user_id = ${seekerUserId}::uuid`,
  );

  return {
    items: page.map((r) => ({
      applicationId: r.applicationId,
      listingId: r.listingId,
      title: r.title ?? '',
      orgName: r.orgName ?? '',
      orgLogoMediaId: r.orgLogoMediaId,
      seekerStatus: seekerStatus(r.status),
      submittedAt: new Date(r.at).toISOString(),
    })),
    nextBefore:
      rows.length > limit && last
        ? encodeCursor({ view: i.view, at: last.at, id: last.applicationId })
        : null,
    counts: {
      applied: counted?.applied ?? 0,
      interviews: counted?.interviews ?? 0,
      offers: counted?.offers ?? 0,
    },
  };
}

/**
 * Renders from the frozen snapshot only, so a closed or removed listing never 404s it. Someone
 * else's application is `not_found`, the same as one that does not exist.
 */
export async function getReceipt(
  db: DbOrTx,
  seekerUserId: string,
  applicationId: string,
): Promise<ReceiptDto> {
  const [row] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.id, applicationId), eq(applications.seekerUserId, seekerUserId)));
  if (!row) throw notFound('Application not found');
  return buildReceipt(db, row);
}

/** For the operator home (SP8). */
export async function countApplicationsSince(db: DbOrTx, since: Date): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(applications)
    .where(gte(applications.submittedAt, since));
  return row?.n ?? 0;
}
