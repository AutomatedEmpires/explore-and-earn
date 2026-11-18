// Trust decisions on an interview note. Approve delivers it; remove holds it.
import { eq } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { newId } from '@/lib/ids';
import { registerSubjectHandlers } from '@/modules/trust';
import { interviews } from '../schema';
import { releaseInterviewNote } from './notes';

async function apply(db: DbOrTx, id: string, state: 'clear' | 'held'): Promise<void> {
  const [row] = await db.select({ checkId: interviews.checkId }).from(interviews).where(eq(interviews.id, id));
  await db.transaction(async (tx) => {
    await releaseInterviewNote(tx, id, {
      state,
      checkId: row?.checkId ?? newId(),
      labels: [],
    });
  });
}

registerSubjectHandlers('interview', {
  approve: (db, id) => apply(db, id, 'clear'),
  remove: (db, id) => apply(db, id, 'held'),
});
