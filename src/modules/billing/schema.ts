// Drizzle tables for the billing module. The DDL lives in drizzle/1500_billing.sql.
// Only tables are exported here: src/db/schema.ts re-exports every module's schema file.
import { boolean, integer, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const app = pgSchema('app');

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

const PLAN_VALUES = ['starter', 'professional', 'enterprise'] as const;
const INTERVAL_VALUES = ['month', 'year'] as const;
const SUBSCRIPTION_STATUS_VALUES = [
  'incomplete',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'incomplete_expired',
  'paused',
] as const;

export const foundingCodes = app.table('founding_codes', {
  id: uuid('id').primaryKey(),
  /** sha256 hex of the normalized code; the plaintext is never stored. */
  codeHash: text('code_hash').notNull().unique(),
  last4: text('last4').notNull(),
  status: text('status', { enum: ['available', 'held', 'redeemed', 'revoked'] })
    .notNull()
    .default('available'),
  heldByOrgId: uuid('held_by_org_id'),
  heldUntil: ts('held_until'),
  redeemedOrgId: uuid('redeemed_org_id').unique(),
  redeemedAt: ts('redeemed_at'),
  note: text('note'),
  createdBy: uuid('created_by'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const billingAccounts = app.table('billing_accounts', {
  orgId: uuid('org_id').primaryKey(),
  stripeCustomerId: text('stripe_customer_id').unique(),
  hostSince: ts('host_since'),
  foundingStatus: text('founding_status', { enum: ['none', 'active', 'lapsed', 'forfeited'] })
    .notNull()
    .default('none'),
  foundingCodeId: uuid('founding_code_id'),
  foundingLapsedAt: ts('founding_lapsed_at'),
  openCheckoutSessionId: text('open_checkout_session_id'),
  openCheckoutExpiresAt: ts('open_checkout_expires_at'),
  openCheckoutParamsHash: text('open_checkout_params_hash'),
  openCheckoutUrl: text('open_checkout_url'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const subscriptions = app.table('subscriptions', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id').notNull(),
  stripeSubscriptionId: text('stripe_subscription_id').notNull().unique(),
  status: text('status', { enum: SUBSCRIPTION_STATUS_VALUES }).notNull(),
  plan: text('plan', { enum: PLAN_VALUES }).notNull(),
  interval: text('interval', { enum: INTERVAL_VALUES }).notNull(),
  extraSlots: integer('extra_slots').notNull().default(0),
  currentPeriodStart: ts('current_period_start'),
  currentPeriodEnd: ts('current_period_end'),
  trialEnd: ts('trial_end'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  endedAt: ts('ended_at'),
  couponId: text('coupon_id'),
  /** Stripe's `created`: when the host signed up for this subscription. */
  stripeCreatedAt: ts('stripe_created_at'),
  lastSyncedAt: ts('last_synced_at'),
  planGrantSeq: integer('plan_grant_seq').notNull().default(0),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const billingChanges = app.table('billing_changes', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id').notNull(),
  toPlan: text('to_plan', { enum: PLAN_VALUES }).notNull(),
  toInterval: text('to_interval', { enum: INTERVAL_VALUES }).notNull(),
  toExtraSlots: integer('to_extra_slots').notNull(),
  keepListingIds: uuid('keep_listing_ids').array(),
  status: text('status', { enum: ['pending', 'applied', 'failed'] })
    .notNull()
    .default('pending'),
  requestedBy: uuid('requested_by'),
  error: text('error'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});
