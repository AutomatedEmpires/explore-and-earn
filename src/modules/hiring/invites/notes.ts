// The invite note scan (plan Task 14). `runNoteScan` (hiring/notes.ts) loads the note, scans it
// and releases the result. The loader also serves the operator's review preview, so it returns
// a pending, warned or held note; a cleared one needs neither. The release applies only to a
// note still pending, so a repeated job changes nothing.
import { and, eq } from 'drizzle-orm';
import type { DbOrTx, Tx } from '@/lib/db';
import type { NoteToScan, ScanOutcome } from '../notes';
import { invites } from '../schema';
import { notifyInviteReceived } from './notify';

export async function loadInviteNote(db: DbOrTx, id: string): Promise<NoteToScan | null> {
  const [row] = await db
    .select({ orgId: invites.orgId, note: invites.note, sentAt: invites.sentAt, scanState: invites.scanState })
    .from(invites)
    .where(eq(invites.id, id));
  if (!row || row.note === null || row.scanState === 'clear') return null;
  return { orgId: row.orgId, text: row.note, createdAt: row.sentAt };
}

/** `clear` and `warn` deliver the invite and tell the seeker; `held` tells no one. */
export async function releaseInviteNote(tx: Tx, id: string, outcome: ScanOutcome): Promise<void> {
  const [row] = await tx
    .update(invites)
    .set({ scanState: outcome.state, checkId: outcome.checkId })
    .where(and(eq(invites.id, id), eq(invites.scanState, 'pending')))
    .returning();
  if (!row || outcome.state === 'held' || row.status !== 'sent') return;
  await notifyInviteReceived(tx, row);
}
