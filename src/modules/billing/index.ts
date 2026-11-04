// Public API of the billing module: Stripe customers, subscriptions, plan changes, founding
// codes, webhooks and reconciliation (SP2 spec sections 3 and 8). W0 contract: typed stubs that
// W2 (Tasks 11-16) replaces. Imports entitlements and orgs.
import type { Db, DbOrTx } from '@/lib/db';
import type { Actor } from '@/modules/entitlements';
import type { HandlerMap } from '@/modules/jobs';
import type { BillingGateway } from './gateway';
import type { BillingInterval, PlanCode } from './plans';

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

export type SubscriptionState = {
  status:
    | 'none'
    | 'incomplete'
    | 'trialing'
    | 'active'
    | 'past_due'
    | 'canceled'
    | 'unpaid'
    | 'incomplete_expired'
    | 'paused';
  plan: PlanCode | null;
  interval: BillingInterval | null;
  extraSlots: number;
  entitled: boolean;
  canPublish: boolean;
  trialEnd: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  hostSince: Date | null;
  founding: 'none' | 'active' | 'lapsed' | 'forfeited';
};

function notImplemented(name: string): never {
  throw new Error(`not implemented: ${name} (W2)`);
}

export async function getSubscriptionState(
  _db: DbOrTx,
  _orgId: string,
): Promise<SubscriptionState> {
  return notImplemented('getSubscriptionState');
}

/** The entitled orgs among `orgIds`, for subscriber badges (SP3 cards). */
export async function getSubscriberBadges(
  _db: DbOrTx,
  _orgIds: string[],
): Promise<Map<string, { hostSince: Date }>> {
  return notImplemented('getSubscriberBadges');
}

export async function syncSubscription(_db: Db, _stripeSubscriptionId: string): Promise<void> {
  return notImplemented('syncSubscription');
}

export async function getPendingKeepList(_db: DbOrTx, _orgId: string): Promise<string[] | null> {
  return notImplemented('getPendingKeepList');
}

/** Marks the org's pending plan change applied once listings has enforced its keep list. */
export async function settlePendingChange(_db: DbOrTx, _orgId: string): Promise<void> {
  return notImplemented('settlePendingChange');
}

/** Sets the org status; a ban also enqueues `billing.cancel_subscription`. */
export async function sanctionOrg(
  _db: DbOrTx,
  _orgId: string,
  _action: 'suspend' | 'ban',
  _actor: Actor,
): Promise<void> {
  return notImplemented('sanctionOrg');
}

/** Cancels the org's current subscription at once, without proration. */
export async function cancelSubscriptionNow(
  _db: DbOrTx,
  _orgId: string,
  _gw?: BillingGateway,
): Promise<void> {
  return notImplemented('cancelSubscriptionNow');
}

/** The default card's Stripe checks, for business verification. */
export async function getCardChecks(
  _db: DbOrTx,
  _orgId: string,
): Promise<{ hasCard: boolean; cvcCheck: string | null; postalCheck: string | null }> {
  return notImplemented('getCardChecks');
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

/** W2 replaces each no-op (spec section 6, plus billing.cancel_subscription). */
export const jobHandlers: HandlerMap = {
  'billing.sync_subscription': noop,
  'billing.grant_monthly_credits': noop,
  'billing.apply_launch_date': noop,
  'billing.reconcile': noop,
  'billing.cancel_subscription': noop,
};
