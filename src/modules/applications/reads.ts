// The seeker's reads: the apply context, My jobs lists and receipts; and the operator count (SP4
// spec 3.2 and 5). W0 stub: W4 implements it (Task 22). Read stubs return neutral values.
import type { DbOrTx } from '@/lib/db';
import type {
  ApplicationView,
  ApplyContextDto,
  MyApplicationRow,
  ReceiptDto,
} from '@/lib/applications';

export async function getApplyContext(
  _db: DbOrTx,
  _seekerUserId: string,
  _listingId: string,
): Promise<ApplyContextDto> {
  throw new Error('not implemented: getApplyContext');
}

/** `counts` is additive, for the Profile hub's rows. */
export async function listMyApplications(
  _db: DbOrTx,
  _seekerUserId: string,
  _i: { view: ApplicationView; before?: string; limit?: number },
): Promise<{
  items: MyApplicationRow[];
  nextBefore: string | null;
  counts: Record<ApplicationView, number>;
}> {
  throw new Error('not implemented: listMyApplications');
}

/** Renders from the frozen snapshot only, so a closed or removed listing never 404s it. */
export async function getReceipt(
  _db: DbOrTx,
  _seekerUserId: string,
  _applicationId: string,
): Promise<ReceiptDto> {
  throw new Error('not implemented: getReceipt');
}

/** For the operator home (SP8). */
export async function countApplicationsSince(_db: DbOrTx, _since: Date): Promise<number> {
  return 0;
}
