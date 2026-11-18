// Privacy hooks for SP8 (SP2 spec section 10). Grants and consumptions are org data kept under
// the SP8 retention rules; for a user, only the `created_by` link is personal.
import { asc, eq, max } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import type { EraseResult, PrivacyHandler, RetentionRule } from '@/modules/privacy';
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

const KEEP_YEARS = 7;

/** The ledger's rows for an organization, by table, with the newest row's date. */
async function orgRows(db: DbOrTx, orgId: string): Promise<{ table: string; newest: Date }[]> {
  const [grant] = await db
    .select({ newest: max(grants.createdAt) })
    .from(grants)
    .where(eq(grants.orgId, orgId));
  const [consumption] = await db
    .select({ newest: max(consumptions.createdAt) })
    .from(consumptions)
    .where(eq(consumptions.orgId, orgId));
  return [
    ...(grant?.newest ? [{ table: 'entitlement_grants', newest: grant.newest }] : []),
    ...(consumption?.newest
      ? [{ table: 'entitlement_consumptions', newest: consumption.newest }]
      : []),
  ];
}

function keepUntil(newest: Date): string {
  const until = new Date(newest.getTime());
  until.setUTCFullYear(until.getUTCFullYear() + KEEP_YEARS);
  return until.toISOString().slice(0, 10);
}

export const privacyHandler: PrivacyHandler = {
  module: 'entitlements',
  tables: ['entitlement_grants', 'entitlement_consumptions'],

  // What a host was granted and used is the organization's record, not the person's.
  async exportData() {
    return { records: {}, files: [] };
  },

  async erase(tx, s, ctx): Promise<EraseResult> {
    const heldAll = ctx.holds.includes('all');
    if (s.kind === 'org') {
      // The entitlement ledger backs the invoices, so it is kept as long as they are.
      const rows = await orgRows(tx, s.orgId);
      return {
        erased: 0,
        retained: rows.map((row) =>
          heldAll
            ? { table: row.table, reason: 'legal_hold', until: null }
            : { table: row.table, reason: 'legal_obligation', until: keepUntil(row.newest) },
        ),
      };
    }

    if (heldAll) {
      const [grant] = await tx
        .select({ id: grants.id })
        .from(grants)
        .where(eq(grants.createdBy, s.userId))
        .limit(1);
      const [consumption] = await tx
        .select({ id: consumptions.id })
        .from(consumptions)
        .where(eq(consumptions.createdBy, s.userId))
        .limit(1);
      return {
        erased: 0,
        retained: [
          ...(grant
            ? [{ table: 'entitlement_grants', reason: 'legal_hold' as const, until: null }]
            : []),
          ...(consumption
            ? [{ table: 'entitlement_consumptions', reason: 'legal_hold' as const, until: null }]
            : []),
        ],
      };
    }

    // The append-only guards allow exactly this change: forgetting who created a row.
    const grantRows = await tx
      .update(grants)
      .set({ createdBy: null })
      .where(eq(grants.createdBy, s.userId))
      .returning({ id: grants.id });
    const consumptionRows = await tx
      .update(consumptions)
      .set({ createdBy: null })
      .where(eq(consumptions.createdBy, s.userId))
      .returning({ id: consumptions.id });
    return { erased: grantRows.length + consumptionRows.length, retained: [] };
  },
};
export const retentionRules: RetentionRule[] = [];
