// Submitting an application, in one transaction (SP4 spec 8.4). W0 stub: W4 implements it
// (Task 20).
import type { Db } from '@/lib/db';
import type { ReceiptDto, SubmitInput } from '@/lib/applications';

/** An existing application for the listing comes back with `created: false`. */
export async function submitApplication(
  _db: Db,
  _seekerUserId: string,
  _input: SubmitInput,
): Promise<{ application: ReceiptDto; created: boolean }> {
  throw new Error('not implemented: submitApplication');
}
