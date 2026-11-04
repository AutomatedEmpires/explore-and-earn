// Public API of the billing module: Stripe customers, subscriptions, plan changes, founding
// codes, webhooks and reconciliation (SP2 spec sections 3 and 8). W0 contract: typed stubs that
// W2 (Tasks 11-16) replaces. Imports entitlements and orgs.
import { z } from 'zod';
import type { DbOrTx } from '@/lib/db';
import type { HandlerMap } from '@/modules/jobs';
import { CANCEL_TOPIC, cancelSubscriptionNow } from './cancel';
import { notifyBillingContacts } from './notifications';
import { getSubscriptionState } from './state';
import { syncFromStripe } from './sync';
import { SYNC_TOPIC } from './webhook';
// Module-load registrations: notification types and the billing_account subject handlers.
import './notifications';
import './subjects';

export type { Actor } from '@/modules/entitlements';

export {
  BILLING_INTERVALS,
  EXTRA_SLOT_ANNUAL_MULTIPLIER,
  FOUNDING_COUPON_ID,
  PLANS,
  PLAN_CODES,
  lookupKey,
  monthlyEquivalentCents,
  parseLookupKey,
  planItems,
  planLimits,
  type BillingInterval,
  type LookupKind,
  type Plan,
  type PlanCode,
} from './plans';
export {
  BillingCardError,
  billingGateway,
  isBillingCardError,
  stripeGateway,
  type BillingGateway,
  type CardChecks,
  type CheckoutParams,
  type GatewayItem,
  type ProrationBehavior,
  type SubSnapshot,
  type SubscriptionStatus,
  type SubscriptionUpdate,
  type WebhookEvent,
} from './gateway';
export { makeFakeBillingGateway, type FakeBillingGateway } from './gateway-fake';
export {
  seedStripeCatalog,
  stripeCatalogApi,
  type CatalogApi,
  type CatalogPrice,
  type PortalConfigurationInput,
} from './catalog';
export {
  computeFoundingTrialEnd,
  createCheckout,
  isReturningFounder,
  type CheckoutInput,
} from './checkout';
/** SP6 one-time purchases. */
export { ensureStripeCustomer } from './customers';
export {
  createFoundingCodes,
  generateFoundingCode,
  getFoundingCount,
  normalizeFoundingCode,
} from './founding';

export {
  foundingStatusOf,
  getSubscriberBadges,
  getSubscriptionState,
  type SubscriptionState,
} from './state';
export {
  BILLING_SUBJECT,
  grantMonthCredits,
  parsePlanItems,
  syncFromStripe,
  syncSubscription,
  type ParsedPlan,
  type SyncResult,
} from './sync';
export { SYNC_TOPIC, handleStripeWebhook, type SyncJob } from './webhook';
export { finishCheckout } from './complete';
export {
  getBillingOverview,
  getPublicPrices,
  type BillingOverview,
  type PlanPrices,
  type PublicPrices,
} from './overview';
export {
  changePlan,
  getPendingKeepList,
  previewChange,
  registerSlotHolderSource,
  settlePendingChange,
  type PlanChoice,
  type SlotHolderSource,
} from './change';
export { createPortalSession } from './portal';
export { CANCEL_TOPIC, cancelSubscriptionNow, getCardChecks, sanctionOrg } from './cancel';
export {
  BILLING_CONTACT_ROLES,
  notifyBillingContacts,
  type BillingNotificationType,
} from './notifications';

function notImplemented(name: string): never {
  throw new Error(`not implemented: ${name} (W2)`);
}

/** SP8 registers these with its privacy exporter and eraser. */
export const privacyHandlers: {
  export(db: DbOrTx, userId: string): Promise<Record<string, unknown>>;
  erase(db: DbOrTx, userId: string): Promise<void>;
} = {
  async export() {
    return notImplemented('privacyHandlers.export');
  },
  async erase() {
    return notImplemented('privacyHandlers.erase');
  },
};

const noop = async () => {};

const syncJob = z.object({
  subscriptionId: z.string().min(1),
  notify: z.enum(['payment_failed', 'trial_ending']).optional(),
});

/** Outbox topics (spec section 6, plus billing.cancel_subscription). */
export const jobHandlers: HandlerMap = {
  // A webhook's sync, then the notification the event asked for.
  [SYNC_TOPIC]: async (payload, { db }) => {
    const job = syncJob.parse(payload);
    const result = await syncFromStripe(db, job.subscriptionId);
    if (!result || !job.notify) return;
    const state = await getSubscriptionState(db, result.orgId);
    await notifyBillingContacts(
      db,
      result.orgId,
      job.notify === 'payment_failed' ? 'billing.payment_failed' : 'billing.trial_ending',
      { plan: state.plan, trialEnd: state.trialEnd?.toISOString() ?? null },
    );
  },
  'billing.grant_monthly_credits': noop,
  'billing.apply_launch_date': noop,
  'billing.reconcile': noop,
  // A ban's Stripe cancellation, outside the sanction's transaction (SP2 plan, decision 4).
  [CANCEL_TOPIC]: async (payload, { db }) => {
    const { orgId } = z.object({ orgId: z.uuid() }).parse(payload);
    await cancelSubscriptionNow(db, orgId);
  },
};
