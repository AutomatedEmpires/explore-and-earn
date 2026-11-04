// Public API of the billing module: Stripe customers, subscriptions, plan changes, founding
// codes, webhooks and reconciliation (SP2 spec sections 3 and 8). W0 contract: typed stubs that
// W2 (Tasks 11-16) replaces. Imports entitlements and orgs.
import type { Db, DbOrTx } from '@/lib/db';
import type { Actor } from '@/modules/entitlements';
import type { HandlerMap } from '@/modules/jobs';

export type { Actor } from '@/modules/entitlements';

export type PlanCode = 'starter' | 'professional' | 'enterprise';
export type BillingInterval = 'month' | 'year';

/** Section 8.1 values. Stripe prices are authoritative for charging. */
export const PLANS: Record<
  PlanCode,
  {
    monthlyCents: number;
    annualCents: number;
    slots: number;
    seats: number;
    inviteCredits: number;
    extraSlotMonthlyCents: number;
  }
> = {
  starter: {
    monthlyCents: 9900,
    annualCents: 99000,
    slots: 2,
    seats: 1,
    inviteCredits: 10,
    extraSlotMonthlyCents: 3900,
  },
  professional: {
    monthlyCents: 29900,
    annualCents: 299000,
    slots: 10,
    seats: 5,
    inviteCredits: 50,
    extraSlotMonthlyCents: 2900,
  },
  enterprise: {
    monthlyCents: 59900,
    annualCents: 599000,
    slots: 30,
    seats: 15,
    inviteCredits: 150,
    extraSlotMonthlyCents: 1900,
  },
};

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

/**
 * The Stripe calls billing makes. W0 declares only what `cancelSubscriptionNow` needs; W2's
 * gateway (Task 11) defines the full interface.
 */
export interface BillingGateway {
  /** Cancels immediately, without proration. */
  cancelSubscription(id: string, idempotencyKey: string): Promise<void>;
}

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

/** SP6 one-time purchases. */
export async function ensureStripeCustomer(_db: Db, _orgId: string): Promise<string> {
  return notImplemented('ensureStripeCustomer');
}

export async function syncSubscription(_db: Db, _stripeSubscriptionId: string): Promise<void> {
  return notImplemented('syncSubscription');
}

export async function getPendingKeepList(_db: DbOrTx, _orgId: string): Promise<string[] | null> {
  return notImplemented('getPendingKeepList');
}

export async function createFoundingCodes(
  _db: Db,
  _i: { count: number; note: string; operatorId: string | null },
): Promise<string[]> {
  return notImplemented('createFoundingCodes');
}

export async function getFoundingCount(
  _db: DbOrTx,
): Promise<{ redeemed: number; held: number; max: number }> {
  return notImplemented('getFoundingCount');
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
