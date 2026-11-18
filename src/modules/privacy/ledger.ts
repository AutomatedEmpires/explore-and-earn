// The deletion ledger: one row per erased person, ids only, never purged. It is what a restore
// replays, so it is written in the same transaction that completes the deletion.
import { eq } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { newId } from '@/lib/ids';
import { privacyDeletionLedger } from './schema';

/** Writes the person's ledger row unless one exists, and returns the row's id either way. */
export async function writeLedgerRow(
  db: DbOrTx,
  i: { userId: string; requestId: string; erasedAt: Date },
): Promise<{ ledgerId: string; created: boolean }> {
  const inserted = await db
    .insert(privacyDeletionLedger)
    .values({ id: newId(), userId: i.userId, requestId: i.requestId, erasedAt: i.erasedAt })
    .onConflictDoNothing({ target: privacyDeletionLedger.userId })
    .returning({ id: privacyDeletionLedger.id });
  if (inserted[0]) return { ledgerId: inserted[0].id, created: true };
  const [existing] = await db
    .select({ id: privacyDeletionLedger.id })
    .from(privacyDeletionLedger)
    .where(eq(privacyDeletionLedger.userId, i.userId));
  if (!existing) throw new Error('privacy ledger: the row could not be written');
  return { ledgerId: existing.id, created: false };
}
