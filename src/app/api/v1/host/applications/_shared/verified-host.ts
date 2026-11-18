// The verified-host gate for SP4's host application routes (legal review 7.1, issues 185 and
// 182). A host that is not verified (never verified, running, needs_review, needs_info or
// failed) reads no application or resume, including ones it received while it was verified.
// `hostApplicantGate` decides; the refusal matches the applicant list's
// (hiring/pipeline/gate.ts): 409 `verification_<status>`.
import type { DbOrTx } from '@/lib/db';
import { conflict } from '@/lib/errors';
import { hostApplicantGate, VERIFYING_COPY, type ApplicantDataBlock } from '@/modules/verification';

const COPY: Record<ApplicantDataBlock, string> = {
  unverified: 'Publish your first listing to verify your business, then you can see applicants.',
  running: VERIFYING_COPY,
  needs_review: VERIFYING_COPY,
  needs_info: 'Answer our verification question to see your applicants.',
  failed: "We couldn't verify your business. Ask for a review to see your applicants.",
};

export async function requireVerifiedHost(db: DbOrTx, orgId: string): Promise<void> {
  const gate = await hostApplicantGate(db, orgId);
  if (gate.ok) return;
  throw conflict(COPY[gate.reason], { reason: `verification_${gate.reason}` });
}
