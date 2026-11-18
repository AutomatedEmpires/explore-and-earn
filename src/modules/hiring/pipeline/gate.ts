// The verified-host gate on applicant reads (legal review 7.1, issue 185). The applicant list
// and detail refuse while the host's verification is running, needs_review, needs_info or
// failed, including for applications that arrived while it was verified: an operator who moves
// a host to needs_info or failed during a fraud review stops its reads at once.
// `hostApplicantGate` decides; this file only words the refusal, with the same
// `verification_<status>` reason the pool and invites use.
import type { DbOrTx } from '@/lib/db';
import { conflict } from '@/lib/errors';
import { hostApplicantGate, VERIFYING_COPY, type ApplicantDataBlock } from '@/modules/verification';

const COPY: Record<ApplicantDataBlock, string> = {
  running: VERIFYING_COPY,
  needs_review: VERIFYING_COPY,
  needs_info: 'Answer our verification question to see your applicants.',
  failed: "We couldn't verify your business. Ask for a review to see your applicants.",
};

export async function requireApplicantReads(db: DbOrTx, orgId: string): Promise<void> {
  const gate = await hostApplicantGate(db, orgId);
  if (gate.ok) return;
  throw conflict(COPY[gate.reason], { reason: `verification_${gate.reason}` });
}
