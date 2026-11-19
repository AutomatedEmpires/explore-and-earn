// A host whose verification is decided failed loses its open interviews and offers (issue 212,
// the follow-up to 198). The applicant gate already stops a failed host acting on them, and
// refuses its seekers' answers (./answers.ts), so `hiring.close_for_failed_host` (on
// `verification.decided`) closes them: in one transaction, each invited, scheduled or
// reschedule_requested interview and each sent offer of the org is canceled, as a host cancel
// would, and each seeker who saw one gets a neutral notice ("Interview canceled: <position>" or
// "Offer canceled: <position>") that never mentions verification. The other refused statuses
// (unverified, running, needs_review, needs_info) hold the items open instead.
//
// The status is read again when the job runs, so a host verified again first (an appeal) keeps
// its items. A repeat decision, or a redelivery, finds nothing open and changes nothing. The
// seeker's name is never read here, so no notice or audit row carries it.
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db, Tx } from '@/lib/db';
import { withTx } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { record } from '@/modules/audit';
import { readEnvelope } from '@/modules/jobs';
import { postEvent } from '@/modules/messaging';
import { notify } from '@/modules/notifications';
import { getOrgSummaries } from '@/modules/orgs';
import { transitionStatus } from '../core';
import { interviews, offers, pipelineEntries } from '../schema';
import { placeOf, scheduleFields } from './deliver';
import { setInterviewState, setOfferState } from './state';
import '../notification-types';

type InterviewRow = typeof interviews.$inferSelect;
type OfferRow = typeof offers.$inferSelect;
type Place = Awaited<ReturnType<typeof placeOf>>;

const ACTIVE = ['invited', 'scheduled', 'reschedule_requested'] as const;

/** Why the audit rows say the system closed it. The seeker's notice never says why. */
const REASON = 'host_verification_failed';

/** The seeker saw it: a pending or held note was never delivered, so its cancel is host-only. */
function delivered(row: { scanState: string }): boolean {
  return row.scanState === 'clear' || row.scanState === 'warn';
}

function inboxUrl(threadId: string): string {
  return `${getEnv().APP_URL.replace(/\/+$/, '')}/inbox/${threadId}`;
}

type Closing = {
  tx: Tx;
  now: Date;
  /** Each application's seeker, from its locked pipeline entry. */
  seekers: Map<string, string>;
  place: (listingId: string) => Promise<Place>;
};

async function closeInterview(c: Closing, row: InterviewRow): Promise<void> {
  const [updated] = await c.tx
    .update(interviews)
    .set({ status: 'canceled', sequence: row.sequence + 1 })
    .where(and(eq(interviews.id, row.id), inArray(interviews.status, [...ACTIVE])))
    .returning();
  if (!updated) return;
  await setInterviewState(c.tx, row.applicationId, 'canceled');
  const seen = delivered(row);
  await postEvent(c.tx, row.threadId, { code: 'interview_canceled', visibleTo: seen ? 'all' : 'host' });
  const seekerUserId = c.seekers.get(row.applicationId);
  if (seen && seekerUserId) {
    const place = await c.place(row.listingId);
    // A scheduled time goes into the calendar file, which cancels the seeker's event.
    await notify(c.tx, seekerUserId, 'hiring.interview_canceled', {
      interviewId: row.id,
      sequence: updated.sequence,
      threadId: row.threadId,
      audience: 'seeker',
      orgName: place.orgName,
      position: place.title,
      url: inboxUrl(row.threadId),
      icsMethod: 'CANCEL',
      ...(row.status === 'scheduled' ? scheduleFields(row) : {}),
    });
  }
  await record(c.tx, {
    actorType: 'system',
    actorId: null,
    orgId: row.orgId,
    action: 'hiring.interview_canceled',
    subjectType: 'interview',
    subjectId: row.id,
    data: { reason: REASON },
  });
}

async function closeOffer(c: Closing, row: OfferRow): Promise<void> {
  const [updated] = await c.tx
    .update(offers)
    .set({ status: 'canceled', respondedAt: c.now })
    .where(and(eq(offers.id, row.id), eq(offers.status, 'sent')))
    .returning();
  if (!updated) return;
  // As a host cancel does, the application goes back to interviewing. An application that moved
  // on (withdrawn, say) stays where it is: the offer still closes.
  await transitionStatus(
    c.tx,
    {
      applicationId: row.applicationId,
      from: ['offered'],
      to: 'interviewing',
      actor: { type: 'system' },
      eventKind: 'offer_canceled',
    },
    c.now,
  );
  await setOfferState(c.tx, row.applicationId, 'canceled');
  const seen = delivered(row);
  await postEvent(c.tx, row.threadId, { code: 'offer_canceled', visibleTo: seen ? 'all' : 'host' });
  const seekerUserId = c.seekers.get(row.applicationId);
  if (seen && seekerUserId) {
    const place = await c.place(row.listingId);
    await notify(c.tx, seekerUserId, 'hiring.offer_canceled', {
      offerId: row.id,
      threadId: row.threadId,
      audience: 'seeker',
      orgName: place.orgName,
      position: row.position,
      url: inboxUrl(row.threadId),
    });
  }
  await record(c.tx, {
    actorType: 'system',
    actorId: null,
    orgId: row.orgId,
    action: 'hiring.offer_canceled',
    subjectType: 'offer',
    subjectId: row.id,
    data: { reason: REASON },
  });
}

/** The `hiring.close_for_failed_host` handler (`verification.decided`). */
export async function closeForFailedHost(db: Db, payload: unknown, now = new Date()): Promise<void> {
  const { orgId, status } = readEnvelope(payload, 'verification.decided').data;
  if (status !== 'failed') return;
  await withTx(db, async (tx) => {
    const org = (await getOrgSummaries(tx, [orgId])).get(orgId);
    if (org?.verificationStatus !== 'failed') return;

    const openInterviews = await tx
      .select({ applicationId: interviews.applicationId })
      .from(interviews)
      .where(and(eq(interviews.orgId, orgId), inArray(interviews.status, [...ACTIVE])));
    const openOffers = await tx
      .select({ applicationId: offers.applicationId })
      .from(offers)
      .where(and(eq(offers.orgId, orgId), eq(offers.status, 'sent')));
    const applicationIds = [...new Set([...openInterviews, ...openOffers].map((row) => row.applicationId))];
    if (applicationIds.length === 0) return;

    // The entries are locked first, in id order, then the interviews and offers: the order a
    // seeker's answer and a pipeline transition lock them in.
    const entries = await tx
      .select({ applicationId: pipelineEntries.applicationId, seekerUserId: pipelineEntries.seekerUserId })
      .from(pipelineEntries)
      .where(inArray(pipelineEntries.applicationId, applicationIds))
      .orderBy(asc(pipelineEntries.applicationId))
      .for('update');
    const toClose = await tx
      .select()
      .from(interviews)
      .where(and(eq(interviews.orgId, orgId), inArray(interviews.status, [...ACTIVE])))
      .orderBy(asc(interviews.id))
      .for('update');
    const offersToClose = await tx
      .select()
      .from(offers)
      .where(and(eq(offers.orgId, orgId), eq(offers.status, 'sent')))
      .orderBy(asc(offers.id))
      .for('update');

    const places = new Map<string, Place>();
    const closing: Closing = {
      tx,
      now,
      seekers: new Map(entries.map((entry) => [entry.applicationId, entry.seekerUserId])),
      place: async (listingId) => {
        const known = places.get(listingId);
        if (known) return known;
        const place = await placeOf(tx, listingId, orgId);
        places.set(listingId, place);
        return place;
      },
    };
    for (const row of toClose) await closeInterview(closing, row);
    for (const row of offersToClose) await closeOffer(closing, row);
  });
}
