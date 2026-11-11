// Status changes, withdraw and the Additional step tick (SP4 spec 8.5). W0 stub: W4 implements
// it (Task 21).
import type { Db, DbOrTx } from '@/lib/db';
import type {
  ApplicationStatus,
  ReceiptDto,
  SetStatusInput,
  WithdrawReason,
} from '@/lib/applications';

/** Compare-and-set; forbidden when the table or the actor disallows the move. */
export async function setStatus(
  _tx: DbOrTx,
  _i: SetStatusInput,
): Promise<{ ok: true } | { ok: false; current: ApplicationStatus }> {
  throw new Error('not implemented: setStatus');
}

/** Emits `application.withdrawn`. */
export async function withdraw(
  _tx: DbOrTx,
  _i: { applicationId: string; seekerUserId: string; reason?: WithdrawReason; note?: string },
): Promise<void> {
  throw new Error('not implemented: withdraw');
}

/** Withdraws the seeker's open applications to the org (a block with the option ticked). */
export async function withdrawOpenForOrg(
  _tx: DbOrTx,
  _i: { seekerUserId: string; orgId: string },
): Promise<number> {
  throw new Error('not implemented: withdrawOpenForOrg');
}

/** Toggles until the application reaches a terminal status. */
export async function setAdditionalStep(
  _db: Db,
  _i: { applicationId: string; seekerUserId: string; completed: boolean },
): Promise<ReceiptDto> {
  throw new Error('not implemented: setAdditionalStep');
}
