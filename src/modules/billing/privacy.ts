// Billing's privacy hooks (SP2 spec section 10), which SP8 registers with its exporter and
// eraser. Billing data belongs to the org; a person appears only as who requested a plan change
// (and, for operators, who created founding codes).
import { eq, or } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { enqueue } from '@/modules/jobs';
import type { EraseResult, PrivacyHandler, RetentionRule } from '@/modules/privacy';
import {
  billingAccounts,
  billingChanges,
  foundingCodes,
  foundingDiscounts,
  subscriptions,
} from './schema';

// The same topic as ./cancel's CANCEL_TOPIC, named here so this file loads without the gateway.
const CANCEL_TOPIC = 'billing.cancel_subscription';

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

const KEEP_YEARS = 7;

const some = async (rows: Promise<unknown[]>) => (await rows).length > 0;

/** The billing tables that hold rows for the organization. */
async function orgTables(db: DbOrTx, orgId: string): Promise<string[]> {
  const checks: [string, Promise<unknown[]>][] = [
    [
      'billing_accounts',
      db
        .select({ id: billingAccounts.orgId })
        .from(billingAccounts)
        .where(eq(billingAccounts.orgId, orgId))
        .limit(1),
    ],
    [
      'subscriptions',
      db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(eq(subscriptions.orgId, orgId))
        .limit(1),
    ],
    [
      'billing_changes',
      db
        .select({ id: billingChanges.id })
        .from(billingChanges)
        .where(eq(billingChanges.orgId, orgId))
        .limit(1),
    ],
    [
      'founding_codes',
      db
        .select({ id: foundingCodes.id })
        .from(foundingCodes)
        .where(or(eq(foundingCodes.heldByOrgId, orgId), eq(foundingCodes.redeemedOrgId, orgId)))
        .limit(1),
    ],
    [
      'founding_discounts',
      db
        .select({ id: foundingDiscounts.orgId })
        .from(foundingDiscounts)
        .where(eq(foundingDiscounts.orgId, orgId))
        .limit(1),
    ],
  ];
  const tables: string[] = [];
  for (const [table, rows] of checks) if (await some(rows)) tables.push(table);
  return tables;
}

export const privacyHandler: PrivacyHandler = {
  module: 'billing',
  tables: [
    'billing_accounts',
    'subscriptions',
    'billing_changes',
    'founding_codes',
    'founding_discounts',
  ],

  // Billing records belong to the organization. A host reads them on the billing page.
  async exportData() {
    return { records: {}, files: [] };
  },

  async erase(tx, s, ctx): Promise<EraseResult> {
    const heldAll = ctx.holds.includes('all');

    if (s.kind === 'org') {
      const tables = await orgTables(tx, s.orgId);
      if (heldAll) {
        // The organization stays open under a hold on everything, and so does what it pays for.
        return {
          erased: 0,
          retained: tables.map((table) => ({ table, reason: 'legal_hold', until: null })),
        };
      }
      // The organization is closing: stop charging now. Closing it queues the same job.
      await enqueue(tx, {
        topic: CANCEL_TOPIC,
        payload: { orgId: s.orgId },
        dedupeKey: `cancel:${s.orgId}:close`,
      });
      if (ctx.holds.includes('billing')) {
        return {
          erased: 0,
          retained: tables.map((table) => ({ table, reason: 'legal_hold', until: null })),
        };
      }
      // Invoices and what backs them are kept 7 years (tax and accounting law).
      const until = new Date(ctx.now.getTime());
      until.setUTCFullYear(until.getUTCFullYear() + KEEP_YEARS);
      return {
        erased: 0,
        retained: tables.map((table) => ({
          table,
          reason: 'legal_obligation',
          until: until.toISOString().slice(0, 10),
        })),
      };
    }

    if (heldAll || ctx.holds.includes('billing')) {
      const tables: string[] = [];
      if (
        await some(
          tx
            .select({ id: billingChanges.id })
            .from(billingChanges)
            .where(eq(billingChanges.requestedBy, s.userId))
            .limit(1),
        )
      ) {
        tables.push('billing_changes');
      }
      if (
        await some(
          tx
            .select({ id: foundingCodes.id })
            .from(foundingCodes)
            .where(eq(foundingCodes.createdBy, s.userId))
            .limit(1),
        )
      ) {
        tables.push('founding_codes');
      }
      return {
        erased: 0,
        retained: tables.map((table) => ({ table, reason: 'legal_hold', until: null })),
      };
    }

    const changes = await tx
      .update(billingChanges)
      .set({ requestedBy: null })
      .where(eq(billingChanges.requestedBy, s.userId))
      .returning({ id: billingChanges.id });
    const codes = await tx
      .update(foundingCodes)
      .set({ createdBy: null })
      .where(eq(foundingCodes.createdBy, s.userId))
      .returning({ id: foundingCodes.id });
    return { erased: changes.length + codes.length, retained: [] };
  },
};
export const retentionRules: RetentionRule[] = [];
