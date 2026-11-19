// Plans, Stripe lookup keys and the founding coupons (SP2 spec section 8.1, FD-6 and FD-7).
// PLANS is for limits and display; the Stripe prices the seed creates from it are authoritative
// for charging.

export type PlanCode = 'starter' | 'professional' | 'enterprise';
export type BillingInterval = 'month' | 'year';

export const PLAN_CODES: readonly PlanCode[] = ['starter', 'professional', 'enterprise'];
export const BILLING_INTERVALS: readonly BillingInterval[] = ['month', 'year'];

export type Plan = {
  monthlyCents: number;
  annualCents: number;
  slots: number;
  seats: number;
  inviteCredits: number;
  extraSlotMonthlyCents: number;
};

/** Section 8.1 values. Stripe prices are authoritative for charging. */
export const PLANS: Record<PlanCode, Plan> = {
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

/** An extra slot on an annual plan costs 10× its monthly price (one subscription, one interval). */
export const EXTRA_SLOT_ANNUAL_MULTIPLIER = 10;

// The founding offer (FD-7 in docs/decisions/2026-11-04-founder-decisions.md): the first 100
// host organizations by signup get 50% off the plan price, in one of two shapes fixed by the
// interval of their first paid subscription. The founder decided on 2026-11-10 (#45) that it
// covers the plan subscription only, monthly or annual, on any tier, and never an add-on. Both
// coupons therefore apply only to the three tier products, and extra listing slots are charged
// in full. ./founding.ts decides who gets which.

/** Founding discount on the plan price, in percent. */
export const FOUNDING_PERCENT_OFF = 50;
/** Months the monthly shape lasts, counted from the first paid activation. */
export const FOUNDING_MONTHLY_MONTHS = 6;
/** Monthly start: Stripe `repeating` for 6 months, so a tier change inside them keeps it. */
export const FOUNDING_MONTHLY_COUPON_ID = 'founding_50_six_months';
/** Annual start: Stripe `once`, which is the first annual invoice, the first annual term. */
export const FOUNDING_ANNUAL_COUPON_ID = 'founding_50_first_year';

/**
 * The withdrawn 3 November offer (90 days free, then 30% off for life). Never seeded, shown or
 * applied. Sync reports a subscription that carries it as a founding mismatch.
 */
export const RETIRED_FOUNDING_COUPON_ID = 'founding_30_forever';

/** The founding coupon for a first paid subscription on `interval`. */
export function foundingCouponFor(interval: BillingInterval): string {
  return interval === 'month' ? FOUNDING_MONTHLY_COUPON_ID : FOUNDING_ANNUAL_COUPON_ID;
}

/** Whether `couponId` is one of the two FD-7 founding coupons. */
export function isFoundingCoupon(couponId: string | null | undefined): boolean {
  return couponId === FOUNDING_MONTHLY_COUPON_ID || couponId === FOUNDING_ANNUAL_COUPON_ID;
}

export type LookupKind = 'tier' | 'slot';

/** `professional_month` for a tier, `slot_starter_year` for an extra slot. */
export function lookupKey(kind: LookupKind, plan: PlanCode, interval: BillingInterval): string {
  return kind === 'tier' ? `${plan}_${interval}` : `slot_${plan}_${interval}`;
}

const LOOKUP_KEY = /^(slot_)?(starter|professional|enterprise)_(month|year)$/;

/** The plan price a lookup key names, or null for any key billing does not own. */
export function parseLookupKey(
  key: string,
): { kind: LookupKind; plan: PlanCode; interval: BillingInterval } | null {
  const m = LOOKUP_KEY.exec(key);
  if (!m) return null;
  return {
    kind: m[1] ? 'slot' : 'tier',
    plan: m[2] as PlanCode,
    interval: m[3] as BillingInterval,
  };
}

/** The unit price of a lookup key, in cents, from PLANS. */
export function unitAmountCents(kind: LookupKind, plan: PlanCode, interval: BillingInterval) {
  const p = PLANS[plan];
  if (kind === 'tier') return interval === 'month' ? p.monthlyCents : p.annualCents;
  return interval === 'month'
    ? p.extraSlotMonthlyCents
    : p.extraSlotMonthlyCents * EXTRA_SLOT_ANNUAL_MULTIPLIER;
}

/** What the plan costs per month (annual prices divided by 10), to tell upgrades from downgrades. */
export function monthlyEquivalentCents(
  plan: PlanCode,
  interval: BillingInterval,
  extraSlots: number,
): number {
  const total =
    unitAmountCents('tier', plan, interval) + extraSlots * unitAmountCents('slot', plan, interval);
  return interval === 'month' ? total : Math.round(total / 10);
}

/** The Checkout or subscription items for a plan: the tier, plus extra slots when above 0. */
export function planItems(
  plan: PlanCode,
  interval: BillingInterval,
  extraSlots: number,
): { lookupKey: string; quantity: number }[] {
  const items = [{ lookupKey: lookupKey('tier', plan, interval), quantity: 1 }];
  if (extraSlots > 0) items.push({ lookupKey: lookupKey('slot', plan, interval), quantity: extraSlots });
  return items;
}

/** The limits a plan grants (section 8.1). */
export function planLimits(plan: PlanCode, extraSlots: number) {
  const p = PLANS[plan];
  return { listingSlots: p.slots + extraSlots, seats: p.seats, inviteCredits: p.inviteCredits };
}
