// Offer text scan: load the position and the note, then release or hold the offer.
import { eq } from 'drizzle-orm';
import type { DbOrTx, Tx } from '@/lib/db';
import type { NoteToScan, ScanOutcome } from '../notes';
import { offers } from '../schema';
import { publishOffer } from './deliver';

/**
 * The position and the note, one per line. Both reach the seeker, the position in the
 * notification too, so both are scanned (lead decision 2026-11-18, issue 186).
 */
export async function loadOfferNote(db: DbOrTx, id: string): Promise<NoteToScan | null> {
  const [row] = await db.select().from(offers).where(eq(offers.id, id));
  if (!row) return null;
  const parts = [row.position, row.note].map((part) => part?.trim() ?? '').filter((part) => part.length > 0);
  if (parts.length === 0) return null;
  return { orgId: row.orgId, text: parts.join('\n'), createdAt: row.createdAt };
}

export async function releaseOfferNote(tx: Tx, id: string, outcome: ScanOutcome): Promise<void> {
  const [row] = await tx.select().from(offers).where(eq(offers.id, id)).for('update');
  if (!row) return;
  const previous = row.scanState;
  await tx.update(offers).set({ scanState: outcome.state, checkId: outcome.checkId }).where(eq(offers.id, id));
  const cleared = outcome.state === 'clear' || outcome.state === 'warn';
  const undelivered = previous === 'pending' || previous === 'held';
  // An offer that Pass, a withdrawal or the host canceled while its text was held is never sent late.
  if (!cleared || !undelivered || row.status !== 'sent') return;
  await publishOffer(tx, { ...row, scanState: outcome.state, checkId: outcome.checkId });
}
