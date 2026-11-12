// Public API of the billing module: Stripe customers, subscriptions, plan changes, the founding
// offer (FD-7), webhooks and reconciliation (SP2 spec sections 3 and 8; W2, Tasks 11-16).
// Imports entitlements and orgs. Every Stripe call goes through the BillingGateway (./gateway).
import { z } from 'zod';
import type { HandlerMap } from '@/modules/jobs';
import { CANCEL_TOPIC, cancelSubscriptionNow } from './cancel';
import { applyLaunchDate, grantMonthlyCredits, reconcile } from './jobs';
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
  FOUNDING_ANNUAL_COUPON_ID,
  FOUNDING_MONTHLY_COUPON_ID,
  FOUNDING_MONTHLY_MONTHS,
  FOUNDING_PERCENT_OFF,
  PLANS,
  PLAN_CODES,
  foundingCouponFor,
  isFoundingCoupon,
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
  type CatalogCoupon,
  type CatalogPrice,
  type PortalConfigurationInput,
} from './catalog';
export { createCheckout, type CheckoutInput } from './checkout';
/** SP6 one-time purchases. */
export { ensureStripeCustomer } from './customers';
/** FD-7: who gets the founding discount, and its state. */
export {
  foundingSpotsLeft,
  foundingStatusOf,
  getFoundingEligibility,
  getFoundingSummary,
  introEndsAt,
  type FoundingEligibility,
  type FoundingMismatch,
  type FoundingShape,
  type FoundingStatus,
  type FoundingSummary,
} from './founding';
/** Retired by FD-7; kept for scripts/ops-founding-codes.ts and tests/fakes/sp2/billing.ts. */
export {
  createFoundingCodes,
  generateFoundingCode,
  getFoundingCount,
  normalizeFoundingCode,
} from './founding-codes';

export {
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
export { applyLaunchDate, grantMonthlyCredits, reconcile } from './jobs';
/** SP8 registers these with its privacy exporter and eraser. */
export { privacyHandlers } from './privacy';
export {
  BILLING_CONTACT_ROLES,
  notifyBillingContacts,
  type BillingNotificationType,
} from './notifications';

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
  'billing.grant_monthly_credits': async (_payload, { db, now }) => {
    await grantMonthlyCredits(db, now);
  },
  // Retired by FD-7 (no free period to move); still scheduled, so it acknowledges the topic.
  'billing.apply_launch_date': async () => {
    await applyLaunchDate();
  },
  'billing.reconcile': async (_payload, { db, now }) => {
    await reconcile(db, now);
  },
  // A ban's Stripe cancellation, outside the sanction's transaction (SP2 plan, decision 4).
  [CANCEL_TOPIC]: async (payload, { db }) => {
    const { orgId } = z.object({ orgId: z.uuid() }).parse(payload);
    await cancelSubscriptionNow(db, orgId);
  },
};
