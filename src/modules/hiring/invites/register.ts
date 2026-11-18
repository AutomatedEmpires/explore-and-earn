// Trust subject `invite` (SP5 spec 6): an operator's `approve` clears a held or pending note and
// delivers the invite without a second charge (plan decision 18); `remove` holds it, which hides
// it from the seeker. Registered when the hiring index is imported.
import { eq } from 'drizzle-orm';
import { registerSubjectHandlers } from '@/modules/trust';
import { invites } from '../schema';
import { notifyInviteReceived } from './notify';

registerSubjectHandlers('invite', {
  approve: async (db, inviteId) => {
    const [before] = await db.select().from(invites).where(eq(invites.id, inviteId)).for('update');
    if (!before || before.scanState === 'clear') return;
    await db.update(invites).set({ scanState: 'clear' }).where(eq(invites.id, inviteId));
    const undelivered = before.scanState === 'held' || before.scanState === 'pending';
    if (undelivered && before.status === 'sent' && before.expiresAt.getTime() > Date.now()) {
      await notifyInviteReceived(db, before);
    }
  },
  remove: async (db, inviteId) => {
    await db.update(invites).set({ scanState: 'held' }).where(eq(invites.id, inviteId));
  },
});
