// Offer note scan: load the text, then release or hold it.
import { eq } from 'drizzle-orm';
import type { DbOrTx, Tx } from '@/lib/db';
import type { NoteToScan, ScanOutcome } from '../notes';
import { offers } from '../schema';
import { publishOffer } from './deliver';

export async function loadOfferNote(db: DbOrTx, id: string): Promise<NoteToScan | null> {
  const [row] = await db.select().from(offers).where(eq(offers.id, id));
  if (!row?.note) return null;
  return { orgId: row.orgId, text: row.note, createdAt: row.createdAt };
}

export async function releaseOfferNote(tx: Tx, id: string, outcome: ScanOutcome): Promise<void> {
  const [row] = await tx.select().from(offers).where(eq(offers.id, id)).for('update');
  if (!row) return;
  const previous = row.scanState;
  await tx.update(offers).set({ scanState: outcome.state, checkId: outcome.checkId }).where(eq(offers.id, id));
  if ((outcome.state === 'clear' || outcome.state === 'warn') && (previous === 'pending' || previous === 'held')) {
    await publishOffer(tx, { ...row, scanState: outcome.state, checkId: outcome.checkId });
  }
}
