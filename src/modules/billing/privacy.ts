// Billing's privacy hooks (SP2 spec section 10), which SP8 registers with its exporter and
// eraser. Billing data belongs to the org; a person appears only as who requested a plan change
// (and, for operators, who created founding codes).
import { eq } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { billingChanges, foundingCodes } from './schema';

export const privacyHandlers: {
  export(db: DbOrTx, userId: string): Promise<Record<string, unknown>>;
  erase(db: DbOrTx, userId: string): Promise<void>;
} = {
  async export(db, userId) {
    const changes = await db
      .select({
        orgId: billingChanges.orgId,
        toPlan: billingChanges.toPlan,
        toInterval: billingChanges.toInterval,
        toExtraSlots: billingChanges.toExtraSlots,
        status: billingChanges.status,
        requestedAt: billingChanges.createdAt,
      })
      .from(billingChanges)
      .where(eq(billingChanges.requestedBy, userId));
    return { billingChanges: changes };
  },

  async erase(db, userId) {
    await db
      .update(billingChanges)
      .set({ requestedBy: null })
      .where(eq(billingChanges.requestedBy, userId));
    await db
      .update(foundingCodes)
      .set({ createdBy: null })
      .where(eq(foundingCodes.createdBy, userId));
  },
};
