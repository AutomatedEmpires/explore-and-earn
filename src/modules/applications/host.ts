// Host reads and their authorization (SP4 spec 3.2 and 10; plan Task 23).
//
// host* means: the role is owner, admin or recruiter (otherwise 403 `role_not_allowed`; a
// Billing member gets nothing here), the application belongs to the host's own org, and
// canAccessListing passes. Every failure after the role check is `not_found`, the same answer as
// an application that does not exist, so one org can never confirm another org's application
// id, and a host a seeker blocked is never told so.
//
// Hosts address applications by application id only: no read takes a seeker user id, and none
// filters or sorts by a protected trait (legal review 2.2 item 3). Work authorization leaves as
// the two answers a host may see (snapshot.ts).
import { and, eq, sql } from 'drizzle-orm';
import { queryRows, type Db, type DbOrTx } from '@/lib/db';
import type {
  ApplicationSnapshotV1,
  ApplicationSource,
  ApplicationStatus,
  HostApplicationCard,
  HostApplicationDto,
  HostApplicationRef,
} from '@/lib/applications';
import { forbidden, notFound } from '@/lib/errors';
import { record } from '@/modules/audit';
import { getListingSummaries } from '@/modules/listings';
import { canAccessListing } from '@/modules/orgs';
import { isBlockedBetween } from '@/modules/safety';
import type { HostContext } from '@/server/guards';
import { loadEvents } from './receipt';
import { applications, type ApplicationRow } from './schema';
import { hostView } from './snapshot';

const HOST_ROLES: readonly HostContext['role'][] = ['owner', 'admin', 'recruiter'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function authorizedRow(
  db: DbOrTx,
  host: HostContext,
  applicationId: string,
): Promise<ApplicationRow> {
  if (!HOST_ROLES.includes(host.role)) {
    throw forbidden("Your role can't see applicants.", { reason: 'role_not_allowed' });
  }
  const missing = () => notFound('Application not found');
  if (!UUID.test(applicationId)) throw missing();
  // Scoped to the host's org in the query itself: another org's row is never loaded.
  const [row] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.id, applicationId), eq(applications.orgId, host.orgId)));
  if (!row) throw missing();

  const locationId =
    (await getListingSummaries(db, [row.listingId])).get(row.listingId)?.locationId ?? null;
  if (!(await canAccessListing(db, host, { id: row.listingId, locationId }))) throw missing();

  // A seeker who blocked the org is out of its reach (spec 10); the host sees not_found.
  const blocks = await isBlockedBetween(
    db,
    { type: 'user', id: row.seekerUserId },
    { type: 'org', id: row.orgId },
  );
  if (blocks.byA) throw missing();
  return row;
}

export async function authorizeHostApplication(
  db: DbOrTx,
  host: HostContext,
  applicationId: string,
): Promise<HostApplicationRef> {
  const row = await authorizedRow(db, host, applicationId);
  return {
    applicationId: row.id,
    listingId: row.listingId,
    orgId: row.orgId,
    seekerUserId: row.seekerUserId,
    status: row.status,
    submittedAt: row.submittedAt,
  };
}

/** Audited (`applications.snapshot_viewed`). */
export async function getHostApplication(
  db: Db,
  host: HostContext,
  applicationId: string,
): Promise<HostApplicationDto> {
  const row = await authorizedRow(db, host, applicationId);
  const events = await loadEvents(db, row.id);
  await record(db, {
    actorType: 'user',
    actorId: host.user.id,
    orgId: host.orgId,
    action: 'applications.snapshot_viewed',
    subjectType: 'application',
    subjectId: row.id,
    data: { listingId: row.listingId },
  });
  return {
    applicationId: row.id,
    listingId: row.listingId,
    status: row.status,
    source: row.source,
    submittedAt: row.submittedAt.toISOString(),
    snapshot: hostView(row.snapshot),
    additionalStepCompletedAt: row.additionalStepCompletedAt?.toISOString() ?? null,
    events: events.map((e) => ({
      type: e.type,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      actorType: e.actorType,
      note: e.note,
      at: e.createdAt.toISOString(),
    })),
  };
}

type CardRow = {
  applicationId: string;
  listingId: string;
  status: ApplicationStatus;
  source: ApplicationSource;
  submittedAt: string;
  firstName: string | null;
  lastName: string | null;
  city: string | null;
  region: string | null;
  avatarMediaId: string | null;
  coverMediaId: string | null;
  availabilityDate: string | null;
  skills: { label: string; highlighted: boolean }[] | null;
  additionalStepCompletedAt: string | null;
};

const ISO = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;

/**
 * Org-scoped; the caller (SP5) enforces listing scope. Ids of another org, or unknown ones,
 * are left out. Cards come back in the order of `applicationIds`.
 */
export async function getHostCards(
  db: DbOrTx,
  i: { orgId: string; applicationIds: string[] },
): Promise<HostApplicationCard[]> {
  const ids = [...new Set(i.applicationIds.filter((id) => UUID.test(id)))];
  if (ids.length === 0) return [];
  const rows = await queryRows<CardRow>(
    db,
    sql`select id::text as "applicationId", listing_id::text as "listingId", status, source,
        to_char(submitted_at at time zone 'UTC', ${sql.raw(ISO)}) as "submittedAt",
        snapshot->'profile'->>'firstName' as "firstName",
        snapshot->'profile'->>'lastName' as "lastName",
        snapshot->'profile'->>'city' as city,
        snapshot->'profile'->>'region' as region,
        snapshot->'profile'->>'avatarMediaId' as "avatarMediaId",
        snapshot->'profile'->>'coverMediaId' as "coverMediaId",
        snapshot->'profile'->'availability'->>'date' as "availabilityDate",
        snapshot->'profile'->'skills' as skills,
        to_char(additional_step_completed_at at time zone 'UTC', ${sql.raw(ISO)})
          as "additionalStepCompletedAt"
      from app.applications
      where org_id = ${i.orgId}::uuid
        and id in (${sql.join(
          ids.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})`,
  );
  const byId = new Map(rows.map((r) => [r.applicationId, r]));
  const cards: HostApplicationCard[] = [];
  for (const id of ids) {
    const r = byId.get(id.toLowerCase());
    if (!r) continue;
    const skills =
      typeof r.skills === 'string' ? (JSON.parse(r.skills) as CardRow['skills']) : r.skills;
    cards.push({
      applicationId: r.applicationId,
      listingId: r.listingId,
      status: r.status,
      source: r.source,
      submittedAt: r.submittedAt,
      firstName: r.firstName ?? '',
      lastName: r.lastName ?? '',
      city: r.city ?? '',
      region: r.region,
      avatarMediaId: r.avatarMediaId,
      coverMediaId: r.coverMediaId,
      availabilityDate: r.availabilityDate,
      skills: skills ?? [],
      additionalStepCompletedAt: r.additionalStepCompletedAt,
    });
  }
  return cards;
}

/** Org-scoped; the caller (SP5) enforces listing scope. Another org's application is null. */
export async function getSnapshot(
  db: DbOrTx,
  i: { orgId: string; applicationId: string },
): Promise<ApplicationSnapshotV1 | null> {
  if (!UUID.test(i.applicationId) || !UUID.test(i.orgId)) return null;
  const [row] = await db
    .select({ snapshot: applications.snapshot })
    .from(applications)
    .where(and(eq(applications.id, i.applicationId), eq(applications.orgId, i.orgId)));
  return row ? hostView(row.snapshot) : null;
}
