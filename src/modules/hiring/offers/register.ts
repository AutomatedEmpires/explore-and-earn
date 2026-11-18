// Trust decisions on an offer note. Approve delivers it; remove holds it.
import { eq } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { newId } from '@/lib/ids';
import { registerSubjectHandlers } from '@/modules/trust';
import { offers } from '../schema';
import { releaseOfferNote } from './notes';

async function apply(db: DbOrTx, id: string, state: 'clear' | 'held'): Promise<void> {
  const [row] = await db.select({ checkId: offers.checkId }).from(offers).where(eq(offers.id, id));
  await db.transaction(async (tx) => {
    await releaseOfferNote(tx, id, { state, checkId: row?.checkId ?? newId(), labels: [] });
  });
}

registerSubjectHandlers('offer', {
  approve: (db, id) => apply(db, id, 'clear'),
  remove: (db, id) => apply(db, id, 'held'),
});
