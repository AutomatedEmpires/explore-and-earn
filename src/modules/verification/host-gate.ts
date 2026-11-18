// The one gate SP4 apply and SP5 pool, invites and applicant reads call before a host can see
// applicant data or send an invite (legal review 7.1): only a `verified` host passes. A host
// that was never verified, or whose verification is running, needs_review, needs_info or
// failed, is refused with that status as the reason.
//
// Also the new-host rules of legal review 7.3: the daily cap on profile views in a host's first
// 30 days (`requireProfileView`), and the silent-host alert (`alertSilentHost`).
import { createHash } from 'node:crypto';
import type { DbOrTx } from '@/lib/db';
import { rateLimited } from '@/lib/errors';
import { getOrgSummaries } from '@/modules/orgs';
import { consume, consumeNewHostDaily, newHostWindowOpen } from '@/modules/ratelimit';
import { listOpenReviewItems, openReviewItem } from '@/modules/trust';
import { getVerificationStatus, lockVerification, type VerificationStatus } from './decide';

/** Every status but `verified`. */
export type ApplicantDataBlock = Exclude<VerificationStatus, 'verified'>;

export const APPLICANT_DATA_BLOCKED: readonly ApplicantDataBlock[] = [
  'unverified',
  'running',
  'needs_review',
  'needs_info',
  'failed',
];

export type HostApplicantGate = { ok: true } | { ok: false; reason: ApplicantDataBlock };

/** The status that blocks applicant data, or null when this host may receive it. */
export function applicantDataBlock(status: VerificationStatus): ApplicantDataBlock | null {
  return status === 'verified' ? null : status;
}

/** SP4 apply and SP5 pool, invites and applicant reads call this before showing applicant data. */
export async function hostApplicantGate(db: DbOrTx, orgId: string): Promise<HostApplicantGate> {
  const reason = applicantDataBlock(await getVerificationStatus(db, orgId));
  return reason ? { ok: false, reason } : { ok: true };
}

// --- The profile-view cap (legal review 7.3) ----------------------------------------------------

const DAY_SEC = 86_400;

/** What a new host sees once today's profile views are used up. */
export const PROFILE_VIEW_CAP_COPY =
  "You've viewed today's profiles for a new account. You can view more tomorrow.";

/** The limiter key for "this org viewed this person today", hashed so it holds no seeker id. */
function viewedKey(orgId: string, seekerUserId: string): string {
  const digest = createHash('sha256').update(`${orgId}:${seekerUserId}`).digest('base64url');
  return `new-host-viewed:${digest.slice(0, 32)}`;
}

/**
 * Counts a host's view of one person's profile (an applicant's detail or resume, or an
 * Interested candidate) against the daily cap of its first 30 days,
 * `NEW_HOST_DAILY_CAP.profile_views` distinct people a UTC day. Viewing the same person again
 * that day is free. Over the cap it throws 429 `new_host_daily_cap` and counts nothing, so a
 * retry is refused again rather than passing as a repeat. A host past its first 30 days is
 * never limited and writes nothing. Call it once the host is authorized for the profile and
 * before anything is read.
 */
export async function requireProfileView(
  db: DbOrTx,
  orgId: string,
  seekerUserId: string,
  now: Date = new Date(),
): Promise<void> {
  const org = (await getOrgSummaries(db, [orgId])).get(orgId);
  if (!org || !newHostWindowOpen(org.createdAt, now)) return;
  await db.transaction(async (tx) => {
    const seen = await consume(tx, viewedKey(orgId, seekerUserId), 1, DAY_SEC, now);
    if (!seen.allowed) return;
    const daily = await consumeNewHostDaily(tx, orgId, 'profile_views', org.createdAt, now);
    if (!daily.allowed) {
      // Thrown inside the transaction, so neither count is kept.
      throw rateLimited(PROFILE_VIEW_CAP_COPY, {
        reason: 'new_host_daily_cap',
        resetAt: daily.resetAt.toISOString(),
      });
    }
  });
}

// --- The silent-host alert (legal review 7.3) ---------------------------------------------------

/** A host who opens this many applications and replies to none is an operator alert. */
export const SILENT_HOST_OPENED = 10;

/** The fraud item's reason. It carries no count, so one host never has two open items. */
export const SILENT_HOST_REASON = 'silent_host';

export function silentHostAlert(opened: number, replies: number): boolean {
  return opened >= SILENT_HOST_OPENED && replies === 0;
}

/**
 * Opens a fraud-queue item `silent_host` when `silentHostAlert` is true, unless the host already
 * has one open: one open item per host however often it is called (concurrent calls included).
 * A new item opens only after an operator resolved the last one. Returns whether it opened one.
 */
export async function alertSilentHost(
  db: DbOrTx,
  orgId: string,
  opened: number,
  replies: number,
): Promise<boolean> {
  if (!silentHostAlert(opened, replies)) return false;
  return db.transaction(async (tx) => {
    await lockVerification(tx, orgId);
    const open = await listOpenReviewItems(tx, 'business_verification', orgId);
    if (open.some((i) => i.queue === 'fraud' && i.reason === SILENT_HOST_REASON)) return false;
    await openReviewItem(tx, {
      queue: 'fraud',
      subjectType: 'business_verification',
      subjectId: orgId,
      reason: SILENT_HOST_REASON,
    });
    return true;
  });
}
