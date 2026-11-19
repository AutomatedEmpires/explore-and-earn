// The gate on the seeker's answers to a host's interview or offer (issue 212, the follow-up to
// 198). Picking a slot, asking for new times, declining, and accepting or declining an offer each
// tell the host the seeker's first name. So an answer is taken only while the host passes the
// applicant gate (legal review 7.1). A refused host (never verified, running, needs_review,
// needs_info or failed) gets nothing: the answer is refused with the invite's neutral 409
// `not_taking_answers`, which does not say why, before anything is written or sent. The
// interview or offer stays as it was, so the seeker can answer once the host is verified again.
import type { DbOrTx } from '@/lib/db';
import { conflict } from '@/lib/errors';
import { hostApplicantGate } from '@/modules/verification';
import { INVITE_NOT_TAKING_ANSWERS } from '../invites/respond';

/** Refuses the answer unless the host may receive the seeker. Call it before any write. */
export async function requireHostTakesAnswers(db: DbOrTx, orgId: string): Promise<void> {
  if ((await hostApplicantGate(db, orgId)).ok) return;
  throw conflict(INVITE_NOT_TAKING_ANSWERS, { reason: 'not_taking_answers' });
}
