// Drizzle tables for the entitlements module. The DDL lives in drizzle/1600_entitlements.sql.
// Only tables are exported here: src/db/schema.ts re-exports every module's schema file.
// Only this module reads or writes them; other code goes through `@/modules/entitlements`.
import { integer, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const app = pgSchema('app');

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/** SP6 extends the CHECK constraint and this list. */
const ENTITLEMENT_KINDS = ['listing_slot', 'seat', 'invite_credit'] as const;
const GRANT_SOURCES = ['plan', 'operator', 'pack', 'addon'] as const;

/** Append-only: valid_until can only be shortened, and created_by only cleared. */
export const entitlementGrants = app.table('entitlement_grants', {
  id: uuid('id').primaryKey(),
  /** References app.organizations(id). */
  orgId: uuid('org_id').notNull(),
  kind: text('kind', { enum: ENTITLEMENT_KINDS }).notNull(),
  quantity: integer('quantity').notNull(),
  source: text('source', { enum: GRANT_SOURCES }).notNull(),
  sourceRef: text('source_ref').notNull(),
  validFrom: ts('valid_from').notNull().defaultNow(),
  /** Null means open-ended. */
  validUntil: ts('valid_until'),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  reason: text('reason'),
  /** References app.users(id); null for the system and after a privacy erase. */
  createdBy: uuid('created_by'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

/** Append-only: a row can be reversed once, and created_by only cleared. */
export const entitlementConsumptions = app.table('entitlement_consumptions', {
  id: uuid('id').primaryKey(),
  /** References app.organizations(id). */
  orgId: uuid('org_id').notNull(),
  /** References app.entitlement_grants(id). */
  grantId: uuid('grant_id').notNull(),
  kind: text('kind', { enum: ENTITLEMENT_KINDS }).notNull(),
  quantity: integer('quantity').notNull(),
  subjectType: text('subject_type').notNull(),
  subjectId: text('subject_id').notNull(),
  /** `<key>` for the first row of a consume() call, `<key>#2`, `<key>#3`, ... for the rest. */
  idempotencyKey: text('idempotency_key').notNull().unique(),
  reversedAt: ts('reversed_at'),
  reversalReason: text('reversal_reason'),
  /** References app.users(id); null for the system and after a privacy erase. */
  createdBy: uuid('created_by'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});
