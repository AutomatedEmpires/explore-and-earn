// The billing page's data (GET /host/billing) and the public prices (/pricing). Prices come
// from Stripe, cached in memory for an hour; when Stripe fails the PLANS values are shown.
import { and, eq } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getBalance, getCapacity } from '@/modules/entitlements';
import { can } from '@/modules/orgs';
import type { HostContext } from '@/server/guards';
import { foundingSpotsLeft, getFoundingSummary, type FoundingSummary } from './founding';
import { billingGateway, type BillingGateway } from './gateway';
import {
  BILLING_INTERVALS,
  PLAN_CODES,
  lookupKey,
  unitAmountCents,
  type BillingInterval,
  type PlanCode,
} from './plans';
import { billingChanges } from './schema';
import { getSubscriptionState, type SubscriptionState } from './state';

export type PlanPrices = { month: number; year: number; slotMonth: number; slotYear: number };
export type PublicPrices = { source: 'stripe' | 'fallback'; plans: Record<PlanCode, PlanPrices> };

const CACHE_MS = 60 * 60 * 1000;
let cache: { at: number; prices: PublicPrices } | undefined;

/** Clears the price cache (tests). */
export function resetPublicPricesCache(): void {
  cache = undefined;
}

function fromPlans(): PublicPrices {
  const plans = {} as Record<PlanCode, PlanPrices>;
  for (const plan of PLAN_CODES) {
    plans[plan] = {
      month: unitAmountCents('tier', plan, 'month'),
      year: unitAmountCents('tier', plan, 'year'),
      slotMonth: unitAmountCents('slot', plan, 'month'),
      slotYear: unitAmountCents('slot', plan, 'year'),
    };
  }
  return { source: 'fallback', plans };
}

/** Stripe's prices for the three plans (any missing one filled from PLANS). */
export async function getPublicPrices(gw: BillingGateway = billingGateway()): Promise<PublicPrices> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.prices;
  const keys: string[] = [];
  for (const kind of ['tier', 'slot'] as const) {
    for (const plan of PLAN_CODES) {
      for (const interval of BILLING_INTERVALS) keys.push(lookupKey(kind, plan, interval));
    }
  }
  try {
    const found = new Map((await gw.listPrices(keys)).map((p) => [p.lookupKey, p.unitAmountCents]));
    const fallback = fromPlans();
    const plans = {} as Record<PlanCode, PlanPrices>;
    const price = (kind: 'tier' | 'slot', plan: PlanCode, interval: BillingInterval) =>
      found.get(lookupKey(kind, plan, interval));
    for (const plan of PLAN_CODES) {
      const f = fallback.plans[plan];
      plans[plan] = {
        month: price('tier', plan, 'month') ?? f.month,
        year: price('tier', plan, 'year') ?? f.year,
        slotMonth: price('slot', plan, 'month') ?? f.slotMonth,
        slotYear: price('slot', plan, 'year') ?? f.slotYear,
      };
    }
    const prices: PublicPrices = { source: 'stripe', plans };
    cache = { at: Date.now(), prices };
    return prices;
  } catch (err) {
    logger.warn('billing: Stripe prices unavailable; showing plan defaults', { error: err });
    return fromPlans();
  }
}

export type BillingOverview = {
  subscription: SubscriptionState;
  prices: PublicPrices;
  usage: {
    listingSlots: { used: number; limit: number };
    seats: { used: number; limit: number };
    inviteCredits: { balance: number; resetsAt: Date | null };
  };
  /** FD-7: the org's founding discount, and how many of the first 100 signups are left. */
  founding: FoundingSummary & { spotsLeft: number };
  /** The plan change waiting for listings to settle. The keep list only for Owners and Admins. */
  pendingChange: {
    toPlan: PlanCode;
    toInterval: BillingInterval;
    toExtraSlots: number;
    keepListingIds?: string[];
  } | null;
};

/** Everything /host/billing shows. Billing members get counts, never listing data. */
export async function getBillingOverview(
  db: DbOrTx,
  ctx: HostContext,
  gw: BillingGateway = billingGateway(),
): Promise<BillingOverview> {
  const orgId = ctx.orgId;
  const [subscription, prices, listingSlots, seats, inviteCredits, founding, spotsLeft, [pending]] =
    await Promise.all([
      getSubscriptionState(db, orgId),
      getPublicPrices(gw),
      getCapacity(db, orgId, 'listing_slot'),
      getCapacity(db, orgId, 'seat'),
      getBalance(db, orgId, 'invite_credit'),
      getFoundingSummary(db, orgId),
      foundingSpotsLeft(db),
      db
        .select()
        .from(billingChanges)
        .where(and(eq(billingChanges.orgId, orgId), eq(billingChanges.status, 'pending'))),
    ]);
  const seesListings = can(ctx, 'billing.plan');
  return {
    subscription,
    prices,
    usage: { listingSlots, seats, inviteCredits },
    founding: { ...founding, spotsLeft },
    pendingChange: pending
      ? {
          toPlan: pending.toPlan,
          toInterval: pending.toInterval,
          toExtraSlots: pending.toExtraSlots,
          ...(seesListings && pending.keepListingIds
            ? { keepListingIds: pending.keepListingIds }
            : {}),
        }
      : null,
  };
}
