// Interview text scan: load every host text the seeker will read, then release or hold it.
import { eq } from 'drizzle-orm';
import type { DbOrTx, Tx } from '@/lib/db';
import type { NoteToScan, ScanOutcome } from '../notes';
import { interviews } from '../schema';
import { publishInterviewInvite } from './deliver';

type InterviewRow = typeof interviews.$inferSelect;

/**
 * The note, phone note, address and video link, one per line; null when the host wrote none.
 * All of it reaches the seeker, so all of it is scanned (lead decision 2026-11-18, issue 186).
 */
export function interviewScanText(
  row: Pick<InterviewRow, 'note' | 'phoneNote' | 'address' | 'videoUrl'>,
): string | null {
  const parts = [row.note, row.phoneNote, row.address, row.videoUrl]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part.length > 0);
  return parts.length > 0 ? parts.join('\n') : null;
}

export async function loadInterviewNote(db: DbOrTx, id: string): Promise<NoteToScan | null> {
  const [row] = await db.select().from(interviews).where(eq(interviews.id, id));
  if (!row) return null;
  const text = interviewScanText(row);
  if (text === null) return null;
  return { orgId: row.orgId, text, createdAt: row.createdAt };
}

export async function releaseInterviewNote(
  tx: Tx,
  id: string,
  outcome: ScanOutcome,
  now = new Date(),
): Promise<void> {
  const [row] = await tx.select().from(interviews).where(eq(interviews.id, id)).for('update');
  if (!row) return;
  const previous = row.scanState;
  await tx
    .update(interviews)
    .set({ scanState: outcome.state, checkId: outcome.checkId })
    .where(eq(interviews.id, id));
  const cleared = outcome.state === 'clear' || outcome.state === 'warn';
  const undelivered = previous === 'pending' || previous === 'held';
  if (!cleared || !undelivered) return;
  // An invite that was canceled or ran out while its text was held is never sent late.
  const open = row.status === 'invited' && (!row.expiresAt || row.expiresAt.getTime() > now.getTime());
  if (!open) return;
  await publishInterviewInvite(tx, { ...row, scanState: outcome.state, checkId: outcome.checkId });
}
