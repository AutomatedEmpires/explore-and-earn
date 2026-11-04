// Privacy hooks for SP8 (SP2 spec section 10). Grants and consumptions are org data kept under
// the SP8 retention rules; for a user, only the `created_by` link is personal.
import { asc, eq } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { entitlementConsumptions as consumptions, entitlementGrants as grants } from './schema';

export const privacyHandlers: {
  export(db: DbOrTx, userId: string): Promise<Record<string, unknown>>;
  erase(db: DbOrTx, userId: string): Promise<void>;
} = {
  /** The grants and consumptions the user created. */
  async export(db, userId) {
    const grantRows = await db
      .select({
        id: grants.id,
        orgId: grants.orgId,
        kind: grants.kind,
        quantity: grants.quantity,
        source: grants.source,
        validFrom: grants.validFrom,
        validUntil: grants.validUntil,
        createdAt: grants.createdAt,
      })
      .from(grants)
      .where(eq(grants.createdBy, userId))
      .orderBy(asc(grants.createdAt), asc(grants.id));
    const consumptionRows = await db
      .select({
        id: consumptions.id,
        orgId: consumptions.orgId,
        kind: consumptions.kind,
        quantity: consumptions.quantity,
        subjectType: consumptions.subjectType,
        subjectId: consumptions.subjectId,
        reversedAt: consumptions.reversedAt,
        createdAt: consumptions.createdAt,
      })
      .from(consumptions)
      .where(eq(consumptions.createdBy, userId))
      .orderBy(asc(consumptions.createdAt), asc(consumptions.id));
    return {
      entitlementGrantsCreated: grantRows,
      entitlementConsumptionsCreated: consumptionRows,
    };
  },

  /** Unlinks the user from the rows they created (the append-only guards allow only this). */
  async erase(db, userId) {
    await db.transaction(async (tx) => {
      await tx.update(grants).set({ createdBy: null }).where(eq(grants.createdBy, userId));
      await tx
        .update(consumptions)
        .set({ createdBy: null })
        .where(eq(consumptions.createdBy, userId));
    });
  },
};
