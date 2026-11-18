// The one gate SP4 apply and SP5 pool and invites call before a host can see applicant
// data or send an invite. A host whose verification is running, needs_review, needs_info
// or failed is refused with that status as the reason.
import type { DbOrTx } from '@/lib/db';
import { openReviewItem } from '@/modules/trust';
import { getVerificationStatus, type VerificationStatus } from './decide';

export const APPLICANT_DATA_BLOCKED = ['running', 'needs_review', 'needs_info', 'failed'] as const;

export type ApplicantDataBlock = (typeof APPLICANT_DATA_BLOCKED)[number];

export type HostApplicantGate = { ok: true } | { ok: false; reason: ApplicantDataBlock };

const BLOCKED = new Set<string>(APPLICANT_DATA_BLOCKED);

/** The status that blocks applicant data, or null when this host may receive it. */
export function applicantDataBlock(status: VerificationStatus): ApplicantDataBlock | null {
  return BLOCKED.has(status) ? (status as ApplicantDataBlock) : null;
}

/** SP4 apply and SP5 pool and invites call this before showing applicant data. */
export async function hostApplicantGate(db: DbOrTx, orgId: string): Promise<HostApplicantGate> {
  const reason = applicantDataBlock(await getVerificationStatus(db, orgId));
  return reason ? { ok: false, reason } : { ok: true };
}

/** A host who opens this many applications and replies to none is an operator alert. */
export const SILENT_HOST_OPENED = 10;

export function silentHostAlert(opened: number, replies: number): boolean {
  return opened >= SILENT_HOST_OPENED && replies === 0;
}

/** Opens one fraud-queue item when `silentHostAlert` is true. Returns whether it opened one. */
export async function alertSilentHost(
  db: DbOrTx,
  orgId: string,
  opened: number,
  replies: number,
): Promise<boolean> {
  if (!silentHostAlert(opened, replies)) return false;
  await openReviewItem(db, {
    queue: 'fraud',
    subjectType: 'organization',
    subjectId: orgId,
    reason: `silent_host:opened=${opened}`,
  });
  return true;
}
