// The verified-host gate on applicant messaging (legal review 7.1; lead decision of 2026-11-18 on
// issue 45; issue 199). A host the applicant gate refuses (`hostApplicantGate`: never verified,
// running, needs_review, needs_info or failed) loses applicant messaging: no thread list, no
// thread read or attachment, no send and no bulk send. The refusal is the applicant list's
// (hiring/pipeline/gate.ts), word for word: 409 `verification_<status>`. Messaging never imports
// hiring, so the copy is repeated here, and the host threads route test holds the two equal.
//
// The seeker keeps reading their own messages. While the host is refused, the thread is
// read-only both ways and reads `unavailable` to the seeker, which names no reason
// (`blockingReason` in threads.ts).
import type { DbOrTx } from '@/lib/db';
import { conflict } from '@/lib/errors';
import { getOrgSummaries, type OrgSummary } from '@/modules/orgs';
import {
  VERIFYING_COPY,
  applicantDataBlock,
  hostApplicantGate,
  type ApplicantDataBlock,
} from '@/modules/verification';

const COPY: Record<ApplicantDataBlock, string> = {
  unverified: 'Publish your first listing to verify your business, then you can see applicants.',
  running: VERIFYING_COPY,
  needs_review: VERIFYING_COPY,
  needs_info: 'Answer our verification question to see your applicants.',
  failed: "We couldn't verify your business. Ask for a review to see your applicants.",
};

/**
 * Refuses a host the applicant gate refuses with the applicant list's 409. Call it once the
 * caller is a host of `orgId` and before anything of a thread is read or written.
 */
export async function requireMessagingAccess(db: DbOrTx, orgId: string): Promise<void> {
  const gate = await hostApplicantGate(db, orgId);
  if (gate.ok) return;
  throw conflict(COPY[gate.reason], { reason: `verification_${gate.reason}` });
}

/** The applicant gate's rule on a summary already read: only a verified org's team may message. */
export function orgMayMessage(org: Pick<OrgSummary, 'verificationStatus'> | undefined): boolean {
  return org !== undefined && applicantDataBlock(org.verificationStatus) === null;
}

/** Whether the org's team may message applicants now. An org that is gone may not. */
export async function hostMayMessage(db: DbOrTx, orgId: string): Promise<boolean> {
  return orgMayMessage((await getOrgSummaries(db, [orgId])).get(orgId));
}
