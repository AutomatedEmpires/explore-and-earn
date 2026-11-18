// Interview note scan: load the text, then release or hold it.
import { eq } from 'drizzle-orm';
import type { DbOrTx, Tx } from '@/lib/db';
import type { NoteToScan, ScanOutcome } from '../notes';
import { interviews } from '../schema';
import { publishInterviewInvite } from './deliver';

export async function loadInterviewNote(db: DbOrTx, id: string): Promise<NoteToScan | null> {
  const [row] = await db.select().from(interviews).where(eq(interviews.id, id));
  if (!row?.note) return null;
  return { orgId: row.orgId, text: row.note, createdAt: row.createdAt };
}

export async function releaseInterviewNote(tx: Tx, id: string, outcome: ScanOutcome): Promise<void> {
  const [row] = await tx.select().from(interviews).where(eq(interviews.id, id)).for('update');
  if (!row) return;
  const previous = row.scanState;
  await tx
    .update(interviews)
    .set({ scanState: outcome.state, checkId: outcome.checkId })
    .where(eq(interviews.id, id));
  if ((outcome.state === 'clear' || outcome.state === 'warn') && (previous === 'pending' || previous === 'held')) {
    await publishInterviewInvite(tx, { ...row, scanState: outcome.state, checkId: outcome.checkId });
  }
}
