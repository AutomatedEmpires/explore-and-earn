// Plans, Stripe lookup keys and the founding coupon (SP2 spec sections 8.1 and 8.7). PLANS is
// for limits and display; the Stripe prices the seed creates from it are authoritative for
// charging.

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

/** 30% off, forever, on the subscription (tier and extra slots, across plan changes). */
export const FOUNDING_COUPON_ID = 'founding_30_forever';

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
