// The business verification gate (legal review section 7, P0 item 5; issue 117). A host sees no
// pool, no Interested profile and no invite list, and sends no invite, until its verification
// clears. The refusal names the verification status as `verification_<status>`.
import type { DbOrTx } from '@/lib/db';
import { conflict } from '@/lib/errors';
import { hostApplicantGate, VERIFYING_COPY, type ApplicantDataBlock } from '@/modules/verification';

const COPY: Record<ApplicantDataBlock, string> = {
  running: VERIFYING_COPY,
  needs_review: VERIFYING_COPY,
  needs_info: 'Answer our verification question to see candidates and send invites.',
  failed: "We couldn't verify your business. Ask for a review to see candidates and send invites.",
};

export async function requireApplicantAccess(db: DbOrTx, orgId: string): Promise<void> {
  const gate = await hostApplicantGate(db, orgId);
  if (gate.ok) return;
  throw conflict(COPY[gate.reason], { reason: `verification_${gate.reason}` });
}
