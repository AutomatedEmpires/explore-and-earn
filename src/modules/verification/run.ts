// Starting and running business verification (SP2 spec 8.4). A run collects the signals, runs
// the `business_verification` check, and either verifies the org automatically (a low score,
// no hard flags and a card on file) or leaves it in the `fraud` queue. A run is never rejected
// automatically: `failed` comes only from an operator (decide.ts).
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/lib/db';
import { newId } from '@/lib/ids';
import { record } from '@/modules/audit';
import { emit, enqueue, type HandlerMap } from '@/modules/jobs';
import { listOrgLocations, type Location } from '@/modules/locations';
import { getOrgSummaries, setVerificationStatus, type OrgSummary } from '@/modules/orgs';
import {
  CLASSIFIER_ERROR,
  listOpenReviewItems,
  openReviewItem,
  runCheck,
  type CheckResult,
} from '@/modules/trust';
import { getVerificationStatus, lockVerification, openRun, recordDecision } from './decide';
import { businessVerifications } from './schema';
import {
  collectSignals,
  defaultSignalDeps,
  hardFlags,
  type HardFlag,
  type SignalDeps,
  type VerificationSignals,
} from './signals';

export const RUN_TOPIC = 'verification.run';

/** Hard flags put the review item at the front of the fraud queue. */
const HARD_FLAG_PRIORITY = 100;

/** Inserts a `running` run, enqueues `verification.run` and records `verification.started`. */
async function beginRun(tx: DbOrTx, orgId: string, triggerListingId: string | null) {
  const id = newId();
  await tx
    .insert(businessVerifications)
    .values({ id, orgId, triggerListingId, status: 'running' });
  await enqueue(tx, { topic: RUN_TOPIC, payload: { verificationId: id }, dedupeKey: `verify:${id}` });
  await record(tx, {
    actorType: 'system',
    actorId: null,
    orgId,
    action: 'verification.started',
    subjectType: 'organization',
    subjectId: orgId,
    data: { verificationId: id, triggerListingId, reverification: triggerListingId === null },
  });
}

/**
 * Starts verification for an org's first publish: inserts a `running` run, sets the org to
 * `running`, enqueues `verification.run` (dedupe `verify:<id>`) and records
 * `verification.started`. A no-op while a run is open. For an org that is already `verified`
 * or `failed` (a publish that raced the decision) it emits `verification.decided` again, so the
 * waiting listing resumes, and starts nothing.
 */
export async function startVerification(
  db: DbOrTx,
  orgId: string,
  triggerListingId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await lockVerification(tx, orgId);
    if (await openRun(tx, orgId)) return;
    const status = await getVerificationStatus(tx, orgId);
    if (status === 'verified' || status === 'failed') {
      await emit(tx, 'verification.decided', { orgId, status }, newId());
      return;
    }
    await beginRun(tx, orgId, triggerListingId);
    await setVerificationStatus(tx, orgId, 'running');
  });
}

/**
 * Re-runs verification in the background after the org's name or website changed. Only a
 * `verified` org is re-run, and the re-run never lowers it: live listings stay up unless an
 * operator acts (spec 8.4). An org still being verified keeps its open run; an unverified org
 * is verified on its first publish; a failed one changes only through an operator or an appeal.
 */
export async function requestReverification(db: DbOrTx, orgId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await lockVerification(tx, orgId);
    if (await openRun(tx, orgId)) return;
    if ((await getVerificationStatus(tx, orgId)) !== 'verified') return;
    await beginRun(tx, orgId, null);
  });
}

const yesNo = (v: boolean | null) => (v === null ? 'unknown' : v ? 'yes' : 'no');

/** The summary the business_verification check classifies. */
function checkText(
  org: OrgSummary | undefined,
  location: Location | null,
  s: VerificationSignals,
  flags: HardFlag[],
): string {
  return [
    `Business name: ${org?.name ?? 'unknown'}`,
    `Website: ${org?.websiteUrl ?? 'none given'}`,
    `Website reachable over HTTPS: ${yesNo(s.websiteReachable)}`,
    `Owner email domain: ${s.emailDomain ?? 'unknown'}`,
    `Free email provider: ${yesNo(s.freeEmail)}`,
    `Disposable email provider: ${yesNo(s.disposableEmail)}`,
    `Email domain matches the website: ${yesNo(s.domainMatch)}`,
    `Domain age in days: ${s.domainAgeDays ?? 'unknown'}`,
    `Card on file: ${yesNo(s.hasCard)}`,
    `Card CVC check: ${s.cvcCheck ?? 'none'}`,
    `Card postal code check: ${s.postalCheck ?? 'none'}`,
    `Location: ${location ? `${location.city}, ${location.state}` : 'none added'}`,
    `Location in the US: ${yesNo(s.locationInUs)}`,
    `Domain on the operator blocklist: ${yesNo(s.blockedDomain)}`,
    `Hard flags: ${flags.length > 0 ? flags.join(', ') : 'none'}`,
    '',
    'Website text:',
    s.websiteText ?? '(none)',
  ].join('\n');
}

/** The fraud item runCheck opened for a `needs_review` decision (the newest one with its reason). */
async function itemOpenedBy(tx: DbOrTx, orgId: string, check: CheckResult): Promise<string | null> {
  const open = await listOpenReviewItems(tx, 'organization', orgId);
  return open.filter((i) => i.queue === 'fraud' && i.reason === check.reason).at(-1)?.id ?? null;
}

/**
 * Runs one verification (the `verification.run` job). A no-op unless the run is `running`.
 * - With hard flags: the check runs with no review queue, and the run opens its own `fraud`
 *   item `hard_flags:<codes>` at priority 100.
 * - Without: the check runs with queue `fraud`. Approved with a card verifies the org
 *   (`decided_by: 'auto'`); approved without one opens a `no_card` item; anything else waits
 *   in the queue. A rejection is never applied: it waits for an operator too.
 * The run stores its signals, check and review item. A re-run never lowers a verified org.
 */
export async function runVerification(
  db: Db,
  verificationId: string,
  deps: SignalDeps = defaultSignalDeps(),
): Promise<void> {
  const [row] = await db
    .select()
    .from(businessVerifications)
    .where(eq(businessVerifications.id, verificationId));
  if (row?.status !== 'running') return;
  const orgId = row.orgId;

  const signals = await collectSignals(db, orgId, deps);
  const flags = hardFlags(signals);
  const org = (await getOrgSummaries(db, [orgId])).get(orgId);
  const locations = await listOrgLocations(db, orgId);
  const location = locations.find((l) => l.id === org?.primaryLocationId) ?? locations[0] ?? null;

  // The classifier call runs outside any transaction (it can take seconds).
  const check = await runCheck(db, {
    kind: 'business_verification',
    subjectType: 'organization',
    subjectId: orgId,
    text: checkText(org, location, signals, flags),
    reviewQueue: flags.length > 0 ? null : 'fraud',
  });

  await db.transaction(async (tx) => {
    await lockVerification(tx, orgId);
    const [current] = await tx
      .select({ status: businessVerifications.status })
      .from(businessVerifications)
      .where(eq(businessVerifications.id, row.id));
    // An operator may have decided the item already, or another worker finished the run.
    if (current?.status !== 'running') return;

    const fraudItem = async (reason: string, priority?: number) =>
      (
        await openReviewItem(tx, {
          queue: 'fraud',
          subjectType: 'organization',
          subjectId: orgId,
          reason,
          checkId: check.checkId,
          ...(priority === undefined ? {} : { priority }),
          ...(check.reason === CLASSIFIER_ERROR ? {} : { aiConfidence: check.score }),
        })
      ).id;

    const verified = flags.length === 0 && check.decision === 'approved' && signals.hasCard;
    let reviewItemId: string | null = null;
    if (flags.length > 0) {
      reviewItemId = await fraudItem(`hard_flags:${flags.join(',')}`, HARD_FLAG_PRIORITY);
    } else if (check.decision === 'approved' && !signals.hasCard) {
      reviewItemId = await fraudItem('no_card');
    } else if (check.decision === 'needs_review') {
      reviewItemId = await itemOpenedBy(tx, orgId, check);
    } else if (check.decision === 'rejected') {
      // Never auto-rejected: runCheck opens no item for a rejection, so open one here.
      reviewItemId = await fraudItem(check.reason);
    }

    await tx
      .update(businessVerifications)
      .set({
        status: verified ? 'verified' : 'needs_review',
        signals: sql`${JSON.stringify(signals)}::jsonb`,
        checkId: check.checkId,
        reviewItemId,
        ...(verified ? { decidedBy: 'auto' as const, decidedAt: new Date() } : {}),
      })
      .where(eq(businessVerifications.id, row.id));

    if (verified) {
      await recordDecision(tx, {
        orgId,
        verificationId: row.id,
        status: 'verified',
        decidedBy: 'auto',
        reviewItemId: null,
        checkId: check.checkId,
      });
    } else if ((await getVerificationStatus(tx, orgId)) !== 'verified') {
      await setVerificationStatus(tx, orgId, 'needs_review');
    }
  });
}

const runPayload = z.object({ verificationId: z.uuid() });

export const runJobHandlers: HandlerMap = {
  [RUN_TOPIC]: async (payload, { db, now }) => {
    const { verificationId } = runPayload.parse(payload);
    await runVerification(db, verificationId, defaultSignalDeps(now));
  },
};
