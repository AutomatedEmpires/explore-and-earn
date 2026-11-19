// A host opening applications, and the silent-host alert (legal review 7.3: "alert on a host
// that opens many applications but never replies").
//
// Every host read of an application's snapshot or resume goes through `recordHostOpen`, which
// audits it (`applications.snapshot_viewed` or `applications.resume_downloaded`) and, for a host
// in its first 30 days, queues `applications.silent_host_check` once per application. The check
// counts the distinct applications the host has opened (from those audit rows) and whether it
// has answered any applicant (a status change by the host: shortlisting, an interview, an
// offer, not selected, a hire). At SILENT_HOST_OPENED opened and none answered, the
// verification module opens one `silent_host` fraud item (`alertSilentHost`). Messages do not
// count as answers yet: the messaging module exposes no reply count.
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { queryRows, type DbOrTx } from '@/lib/db';
import { record, searchAudit } from '@/modules/audit';
import { enqueue, type HandlerMap } from '@/modules/jobs';
import { getOrgSummaries } from '@/modules/orgs';
import { newHostWindowOpen } from '@/modules/ratelimit';
import { SILENT_HOST_OPENED, alertSilentHost } from '@/modules/verification';
import type { HostContext } from '@/server/guards';

export const SILENT_HOST_TOPIC = 'applications.silent_host_check';

/** The audit actions that mean a host opened an application. */
export const HOST_OPEN_ACTIONS = [
  'applications.snapshot_viewed',
  'applications.resume_downloaded',
] as const;

export type HostOpenAction = (typeof HOST_OPEN_ACTIONS)[number];

/** Audit rows read per page while counting, and the most pages one check reads. */
const PAGE = 200;
const MAX_PAGES = 10;

/**
 * Audits a host's read of one application and, while the host is in its first 30 days, queues
 * the silent-host check for it (dedupe `silent-host:<org>:<application>`: once per application).
 */
export async function recordHostOpen(
  db: DbOrTx,
  host: HostContext,
  i: { applicationId: string; listingId: string; action: HostOpenAction },
  now: Date = new Date(),
): Promise<void> {
  await record(db, {
    actorType: 'user',
    actorId: host.user.id,
    orgId: host.orgId,
    action: i.action,
    subjectType: 'application',
    subjectId: i.applicationId,
    ...(i.action === 'applications.snapshot_viewed' ? { data: { listingId: i.listingId } } : {}),
  });
  const org = (await getOrgSummaries(db, [host.orgId])).get(host.orgId);
  if (!org || !newHostWindowOpen(org.createdAt, now)) return;
  await enqueue(db, {
    topic: SILENT_HOST_TOPIC,
    payload: { orgId: host.orgId },
    dedupeKey: `silent-host:${host.orgId}:${i.applicationId}`,
  });
}

/** True when a member of the org has changed the status of any of its applications. */
async function hostAnswered(db: DbOrTx, orgId: string): Promise<boolean> {
  const rows = await queryRows<{ one: number }>(
    db,
    sql`select 1 as one from app.application_events e
        join app.applications a on a.id = e.application_id
        where a.org_id = ${orgId}::uuid and e.actor_type = 'host'
        limit 1`,
  );
  return rows.length > 0;
}

/** The distinct applications the org has opened since `since`, counted up to `enough`. */
async function openedApplications(
  db: DbOrTx,
  orgId: string,
  since: Date,
  enough: number,
): Promise<number> {
  const opened = new Set<string>();
  let before: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await searchAudit(db, {
      orgId,
      actionPrefixes: [...HOST_OPEN_ACTIONS],
      subjectType: 'application',
      from: since,
      limit: PAGE,
      ...(before ? { before } : {}),
    });
    for (const row of result.items) if (row.subjectId) opened.add(row.subjectId);
    if (opened.size >= enough || !result.nextBefore) break;
    before = result.nextBefore;
  }
  return opened.size;
}

/**
 * The silent-host check for one org: nothing past its first 30 days or once it has answered an
 * applicant; otherwise `alertSilentHost` with the applications it has opened.
 */
export async function checkSilentHost(
  db: DbOrTx,
  orgId: string,
  now: Date = new Date(),
): Promise<void> {
  const org = (await getOrgSummaries(db, [orgId])).get(orgId);
  if (!org || !newHostWindowOpen(org.createdAt, now)) return;
  if (await hostAnswered(db, orgId)) return;
  const opened = await openedApplications(db, orgId, org.createdAt, SILENT_HOST_OPENED);
  await alertSilentHost(db, orgId, opened, 0);
}

const checkPayload = z.object({ orgId: z.uuid() });

export const silentHostHandlers: HandlerMap = {
  [SILENT_HOST_TOPIC]: async (payload, { db, now }) => {
    const { orgId } = checkPayload.parse(payload);
    await checkSilentHost(db, orgId, now);
  },
};
