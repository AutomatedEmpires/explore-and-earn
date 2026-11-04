// Verification decisions (SP2 spec 8.4 and section 6): the automatic verify, operator decisions
// on `organization` review items, the host's answer to an info request, and the appeal after a
// failure. The organization's current status is organizations.verification_status (through
// orgs); each run is a business_verifications row, and at most one run per org is open.
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DbOrTx } from '@/lib/db';
import { badRequest, conflict, notFound } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { record } from '@/modules/audit';
import { emit } from '@/modules/jobs';
import { getOrgSummaries, requireCapability, setVerificationStatus } from '@/modules/orgs';
import { listOpenReviewItems, openAppeal, openReviewItem } from '@/modules/trust';
import type { HostContext } from '@/server/guards';
import { notifyOwnerAdmins } from './notifications';
import { businessVerifications } from './schema';

export type VerificationStatus =
  'unverified' | 'running' | 'verified' | 'needs_review' | 'needs_info' | 'failed';

/** What a host sees while their verification waits for an operator. */
export const VERIFYING_COPY = "We're verifying your business. This usually takes a few hours.";

const OPEN_STATUSES = ['running', 'needs_review', 'needs_info'] as const;

const MAX_INFO_REQUEST = 5_000;

type RunRow = typeof businessVerifications.$inferSelect;

/** Serializes every verification change for one org, until the transaction ends. */
export async function lockVerification(tx: DbOrTx, orgId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`verification:${orgId}`}, 0))`);
}

/** The org's open run (running, needs_review or needs_info), if any. */
export async function openRun(db: DbOrTx, orgId: string): Promise<RunRow | null> {
  const [row] = await db
    .select()
    .from(businessVerifications)
    .where(
      and(
        eq(businessVerifications.orgId, orgId),
        inArray(businessVerifications.status, OPEN_STATUSES),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function latestRun(db: DbOrTx, orgId: string): Promise<RunRow | null> {
  const [row] = await db
    .select()
    .from(businessVerifications)
    .where(eq(businessVerifications.orgId, orgId))
    .orderBy(desc(businessVerifications.createdAt), desc(businessVerifications.id))
    .limit(1);
  return row ?? null;
}

/** The org's verification status. Throws `not_found` for an unknown org. */
export async function getVerificationStatus(
  db: DbOrTx,
  orgId: string,
): Promise<VerificationStatus> {
  const org = (await getOrgSummaries(db, [orgId])).get(orgId);
  if (!org) throw notFound('Organization not found');
  return org.verificationStatus;
}

/** GET /host/verification: the status, and the operator's question while one is open. */
export async function getVerificationDetails(
  db: DbOrTx,
  orgId: string,
): Promise<{ status: VerificationStatus; infoRequest: string | null }> {
  const status = await getVerificationStatus(db, orgId);
  const latest = await latestRun(db, orgId);
  return { status, infoRequest: latest?.status === 'needs_info' ? latest.infoRequest : null };
}

type Decided = 'verified' | 'failed' | 'needs_info';

/**
 * Applies a decision to the org inside `tx`: sets its status (when it changes), emits
 * `verification.decided`, records `verification.decided` and notifies the Owner and Admins
 * (`verification.needs_info` always, `verification.decided` when the status changed).
 */
export async function recordDecision(
  tx: DbOrTx,
  d: {
    orgId: string;
    verificationId: string;
    status: Decided;
    decidedBy: 'auto' | 'operator';
    reviewItemId: string | null;
    checkId?: string | null;
    note?: string;
  },
): Promise<void> {
  const previous = await getVerificationStatus(tx, d.orgId);
  if (previous !== d.status) await setVerificationStatus(tx, d.orgId, d.status, new Date());
  await emit(tx, 'verification.decided', { orgId: d.orgId, status: d.status }, newId());
  await record(tx, {
    actorType: d.decidedBy === 'auto' ? 'system' : 'operator',
    actorId: null,
    orgId: d.orgId,
    action: 'verification.decided',
    subjectType: 'organization',
    subjectId: d.orgId,
    data: {
      verificationId: d.verificationId,
      status: d.status,
      previous,
      decidedBy: d.decidedBy,
      reviewItemId: d.reviewItemId,
      checkId: d.checkId ?? null,
    },
  });
  if (d.status === 'needs_info') {
    await notifyOwnerAdmins(tx, d.orgId, 'verification.needs_info', { note: d.note ?? null });
  } else if (previous !== d.status) {
    await notifyOwnerAdmins(tx, d.orgId, 'verification.decided', { status: d.status });
  }
}

/**
 * Writes an operator's outcome onto the org's open run, or onto a new run when none is open
 * (an appeal, or a fraud item that listings opened), then applies it.
 */
async function writeOperatorOutcome(
  db: DbOrTx,
  orgId: string,
  reviewItemId: string | null,
  outcome: Decided,
  note?: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await lockVerification(tx, orgId);
    const decided = outcome !== 'needs_info';
    const now = new Date();
    const fields = {
      status: outcome,
      decidedBy: decided ? ('operator' as const) : null,
      decidedAt: decided ? now : null,
      ...(outcome === 'needs_info'
        ? { infoRequest: note ?? null, infoResponse: null, infoWebsiteUrl: null }
        : {}),
    };
    const open = await openRun(tx, orgId);
    let verificationId: string;
    if (open) {
      verificationId = open.id;
      await tx
        .update(businessVerifications)
        .set({ ...fields, reviewItemId: reviewItemId ?? open.reviewItemId })
        .where(eq(businessVerifications.id, open.id));
    } else {
      verificationId = newId();
      await tx.insert(businessVerifications).values({ id: verificationId, orgId, reviewItemId, ...fields });
    }
    await recordDecision(tx, {
      orgId,
      verificationId,
      status: outcome,
      decidedBy: 'operator',
      reviewItemId,
      ...(note ? { note } : {}),
    });
  });
}

/**
 * The `organization` approve: verifies the business once no other item on the org is still
 * open (a subject with two items needs both approved).
 */
export async function operatorApprove(
  db: DbOrTx,
  orgId: string,
  reviewItemId: string | null,
): Promise<void> {
  const others = (await listOpenReviewItems(db, 'organization', orgId)).filter(
    (i) => i.id !== reviewItemId,
  );
  if (others.length > 0) return;
  await writeOperatorOutcome(db, orgId, reviewItemId, 'verified');
}

/** The `organization` remove: the verification fails (the only way it ever fails). */
export async function operatorFail(
  db: DbOrTx,
  orgId: string,
  reviewItemId: string | null,
): Promise<void> {
  await writeOperatorOutcome(db, orgId, reviewItemId, 'failed');
}

/** The `organization` ask_info: asks the Owner and Admins for `note` (required). */
export async function askForInfo(
  db: DbOrTx,
  orgId: string,
  note: string | undefined,
  reviewItemId: string | null,
): Promise<void> {
  const question = note?.trim();
  if (!question) throw badRequest('Asking for information needs a note saying what to add');
  await writeOperatorOutcome(
    db,
    orgId,
    reviewItemId,
    'needs_info',
    question.slice(0, MAX_INFO_REQUEST),
  );
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:' && value.startsWith('https://');
  } catch {
    return false;
  }
}

/** The host's answer to an info request (POST /host/verification/info). */
export const verificationInfoSchema = z.strictObject({
  text: z.string().trim().min(1, 'Tell us a little about your business').max(2_000),
  websiteUrl: z
    .string()
    .trim()
    .max(2_000)
    .refine(isHttpsUrl, 'Use a full address that starts with https://')
    .optional(),
});

export type VerificationInfoInput = z.input<typeof verificationInfoSchema>;

/**
 * Answers an operator's info request: the run goes back to `needs_review` with a new `fraud`
 * item `info_provided`. Owner and Admin only. 409 `not_waiting_for_info` when no question is
 * open. The website given is stored with the answer for the operator; it doesn't change the
 * org's own website (that is PATCH /host/org).
 */
export async function submitVerificationInfo(
  db: DbOrTx,
  ctx: HostContext,
  input: VerificationInfoInput,
): Promise<{ status: 'needs_review' }> {
  requireCapability(ctx, 'team.manage');
  const parsed = verificationInfoSchema.safeParse(input);
  if (!parsed.success) throw badRequest('Invalid information', parsed.error.issues);
  const { text, websiteUrl } = parsed.data;
  const orgId = ctx.orgId;

  await db.transaction(async (tx) => {
    await lockVerification(tx, orgId);
    const open = await openRun(tx, orgId);
    if (!open || open.status !== 'needs_info') {
      throw conflict('There is no question about your business to answer right now', {
        reason: 'not_waiting_for_info',
      });
    }
    const item = await openReviewItem(tx, {
      queue: 'fraud',
      subjectType: 'organization',
      subjectId: orgId,
      reason: 'info_provided',
      ...(open.checkId ? { checkId: open.checkId } : {}),
    });
    await tx
      .update(businessVerifications)
      .set({
        status: 'needs_review',
        infoResponse: text,
        infoWebsiteUrl: websiteUrl ?? null,
        reviewItemId: item.id,
      })
      .where(eq(businessVerifications.id, open.id));
    if ((await getVerificationStatus(tx, orgId)) !== 'verified') {
      await setVerificationStatus(tx, orgId, 'needs_review');
    }
    await record(tx, {
      actorType: 'user',
      actorId: ctx.user.id,
      orgId,
      action: 'verification.info_provided',
      subjectType: 'organization',
      subjectId: orgId,
      data: { verificationId: open.id, reviewItemId: item.id, websiteUrl: websiteUrl ?? null },
    });
  });
  return { status: 'needs_review' };
}

/**
 * "Ask for a review" after a failed verification: an `appeals` item on the decision that failed
 * it. 409 when the latest run hasn't failed (or an appeal is already open).
 */
export async function openVerificationAppeal(
  db: DbOrTx,
  orgId: string,
  note: string,
): Promise<void> {
  const latest = await latestRun(db, orgId);
  if (latest?.status !== 'failed' || !latest.reviewItemId) {
    throw conflict('Only a failed verification can be appealed', { reason: 'not_failed' });
  }
  await openAppeal(db, { originalItemId: latest.reviewItemId, reason: note });
}
