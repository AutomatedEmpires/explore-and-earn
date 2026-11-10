// The founding offer (FD-7 in docs/decisions/2026-11-04-founder-decisions.md).
//
// - Cohort: the first 100 host organizations by signup order. The orgs module numbers them when
//   the app creates the organization; paying has nothing to do with it.
// - One discount per organization, its shape fixed by the interval of its first paid
//   subscription: monthly is 50% off the plan price for six subscription months (a tier change
//   inside them keeps it), annual is 50% off the first annual term. Neither interval change ever
//   grants a new discount. The clock starts at the first paid activation.
// - The server decides: checkout applies the founding coupon only to an eligible organization's
//   first subscription; a plan change that moves to the other interval removes it; sync locks
//   the shape at the first paid activation and reports any founding coupon the rules don't allow
//   (organization 101, a second introductory period, the wrong interval, the retired coupon).
import { and, eq, ne, notInArray } from 'drizzle-orm';
import type { DbOrTx, Tx } from '@/lib/db';
import { record } from '@/modules/audit';
import { FOUNDING_COHORT_SIZE, countFoundingCohort, getFoundingNumber } from '@/modules/orgs';
import type { SubSnapshot, SubscriptionStatus } from './gateway';
import { addMonths, isLapse } from './internal';
import {
  FOUNDING_ANNUAL_COUPON_ID,
  FOUNDING_MONTHLY_COUPON_ID,
  FOUNDING_MONTHLY_MONTHS,
  FOUNDING_PERCENT_OFF,
  RETIRED_FOUNDING_COUPON_ID,
  type BillingInterval,
} from './plans';
import { foundingDiscounts, subscriptions } from './schema';

export type FoundingShape = 'monthly' | 'annual';

/**
 * - `none`: not a founding host, or its first subscription activated without the discount.
 * - `eligible`: a founding host whose first paid subscription has not activated yet.
 * - `active`: inside its introductory period.
 * - `ended`: the introductory period is over (or ended early).
 */
export type FoundingStatus = 'none' | 'eligible' | 'active' | 'ended';

export type FoundingDiscountRow = typeof foundingDiscounts.$inferSelect;

export const shapeOfInterval = (interval: BillingInterval): FoundingShape =>
  interval === 'month' ? 'monthly' : 'annual';

export const intervalOfShape = (shape: FoundingShape): BillingInterval =>
  shape === 'monthly' ? 'month' : 'year';

/** The shape a founding coupon gives, or null for any other coupon. */
export function shapeOfCoupon(couponId: string | null | undefined): FoundingShape | null {
  if (couponId === FOUNDING_MONTHLY_COUPON_ID) return 'monthly';
  if (couponId === FOUNDING_ANNUAL_COUPON_ID) return 'annual';
  return null;
}

/** When the introductory period ends on its own: six months, or one annual term, after it starts. */
export function introEndsAt(shape: FoundingShape, startedAt: Date): Date {
  return addMonths(startedAt, shape === 'monthly' ? FOUNDING_MONTHLY_MONTHS : 12);
}

/** Statuses a subscription only reaches by activating (everything but never-paid incomplete). */
const NEVER_ACTIVATED: readonly SubscriptionStatus[] = ['incomplete', 'incomplete_expired'];

/** A first paid activation: the subscription is active (past_due was active before). */
const isPaidActivation = (status: SubscriptionStatus) =>
  status === 'active' || status === 'past_due';

export async function getFoundingDiscount(
  db: DbOrTx,
  orgId: string,
  o: { forUpdate?: boolean } = {},
): Promise<FoundingDiscountRow | null> {
  const q = db.select().from(foundingDiscounts).where(eq(foundingDiscounts.orgId, orgId));
  const [row] = o.forUpdate ? await q.for('update') : await q;
  return row ?? null;
}

/** Whether the org has had a subscription that activated, other than `exceptStripeId`. */
async function hasActivatedSubscription(
  db: DbOrTx,
  orgId: string,
  exceptStripeId?: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.orgId, orgId),
        notInArray(subscriptions.status, [...NEVER_ACTIVATED]),
        exceptStripeId === undefined
          ? undefined
          : ne(subscriptions.stripeSubscriptionId, exceptStripeId),
      ),
    )
    .limit(1);
  return row !== undefined;
}

export type FoundingEligibility =
  | { eligible: true; foundingNumber: number }
  | { eligible: false; reason: 'not_in_cohort' | 'intro_used'; foundingNumber: number | null };

/**
 * Whether the org's next subscription gets the founding discount: it is one of the first 100 by
 * signup, and it has never had a founding discount or any subscription that activated.
 */
export async function getFoundingEligibility(
  db: DbOrTx,
  orgId: string,
  o: { exceptStripeId?: string } = {},
): Promise<FoundingEligibility> {
  const foundingNumber = await getFoundingNumber(db, orgId);
  if (foundingNumber === null) return { eligible: false, reason: 'not_in_cohort', foundingNumber };
  if (
    (await getFoundingDiscount(db, orgId)) ||
    (await hasActivatedSubscription(db, orgId, o.exceptStripeId))
  ) {
    return { eligible: false, reason: 'intro_used', foundingNumber };
  }
  return { eligible: true, foundingNumber };
}

/** The founding status from the stored facts. */
export function foundingStatusOf(
  i: { eligibility: FoundingEligibility; discount: FoundingDiscountRow | null },
  now: Date = new Date(),
): FoundingStatus {
  if (i.discount) {
    return i.discount.endedAt === null && now < i.discount.endsAt ? 'active' : 'ended';
  }
  return i.eligibility.eligible ? 'eligible' : 'none';
}

export type FoundingSummary = {
  status: FoundingStatus;
  /** The org's place in signup order (1-100), or null when it is not a founding host. */
  number: number | null;
  shape: FoundingShape | null;
  percentOff: number;
  startedAt: Date | null;
  /** When the introductory period ends (or ended). */
  endsAt: Date | null;
};

/** What billing shows about the org's founding discount. */
export async function getFoundingSummary(
  db: DbOrTx,
  orgId: string,
  now: Date = new Date(),
): Promise<FoundingSummary> {
  const [eligibility, discount] = await Promise.all([
    getFoundingEligibility(db, orgId),
    getFoundingDiscount(db, orgId),
  ]);
  return {
    status: foundingStatusOf({ eligibility, discount }, now),
    number: eligibility.foundingNumber,
    shape: discount?.shape ?? null,
    percentOff: FOUNDING_PERCENT_OFF,
    startedAt: discount?.startedAt ?? null,
    endsAt: discount ? (discount.endedAt ?? discount.endsAt) : null,
  };
}

/** Founding numbers still free. */
export async function foundingSpotsLeft(db: DbOrTx): Promise<number> {
  return Math.max(0, FOUNDING_COHORT_SIZE - (await countFoundingCohort(db)));
}

/** Why a synced subscription's founding coupon breaks the FD-7 rules. */
export type FoundingMismatch =
  /** The org is not one of the first 100 (organization 101 and later). */
  | 'not_in_cohort'
  /** The org already used its one introductory period. */
  | 'second_intro'
  /** The coupon's shape does not match the subscription's interval. */
  | 'wrong_interval'
  /** The withdrawn founding_30_forever coupon. */
  | 'retired_coupon';

/**
 * Applies FD-7 to one synced subscription, inside sync's transaction (under the org lock):
 * - at the first paid activation of an eligible org's subscription carrying a founding coupon,
 *   stores the discount and its shape;
 * - on the discount's own subscription, ends the introductory period early when it moves to the
 *   other interval or ends.
 * Returns the mismatch to report when the subscription carries a founding coupon the rules
 * don't allow (nothing is stored for it), else null.
 */
export async function syncFoundingDiscount(
  tx: Tx,
  i: { orgId: string; snap: SubSnapshot; interval: BillingInterval; now: Date },
): Promise<FoundingMismatch | null> {
  const { orgId, snap, interval, now } = i;
  const discount = await getFoundingDiscount(tx, orgId, { forUpdate: true });
  const own = discount !== null && discount.stripeSubscriptionId === snap.id;

  if (own && discount.endedAt === null && now < discount.endsAt) {
    const endedReason = isLapse(snap.status)
      ? ('subscription_ended' as const)
      : intervalOfShape(discount.shape) !== interval
        ? ('interval_change' as const)
        : null;
    if (endedReason) {
      await tx
        .update(foundingDiscounts)
        .set({ endedAt: now, endedReason })
        .where(eq(foundingDiscounts.orgId, orgId));
      await record(tx, {
        actorType: 'system',
        actorId: null,
        orgId,
        action: 'billing.founding_ended',
        subjectType: 'organization',
        subjectId: orgId,
        data: { reason: endedReason, shape: discount.shape, subscriptionId: snap.id },
      });
    }
  }

  if (snap.couponId === RETIRED_FOUNDING_COUPON_ID) return 'retired_coupon';
  const shape = shapeOfCoupon(snap.couponId);
  if (!shape) return null;

  if (discount) {
    if (!own) return 'second_intro';
    return discount.shape === shape && intervalOfShape(shape) === interval
      ? null
      : 'wrong_interval';
  }
  if (intervalOfShape(shape) !== interval) return 'wrong_interval';
  // Not paid yet (or already over without ever being seen active): decided when it activates.
  if (!isPaidActivation(snap.status)) return null;

  const eligibility = await getFoundingEligibility(tx, orgId, { exceptStripeId: snap.id });
  if (!eligibility.eligible) {
    return eligibility.reason === 'not_in_cohort' ? 'not_in_cohort' : 'second_intro';
  }

  // The first paid activation: the shape is fixed and the clock starts.
  const startedAt = snap.startDate;
  const endsAt = introEndsAt(shape, startedAt);
  const inserted = await tx
    .insert(foundingDiscounts)
    .values({
      orgId,
      shape,
      couponId: snap.couponId as string,
      stripeSubscriptionId: snap.id,
      startedAt,
      endsAt,
    })
    .onConflictDoNothing()
    .returning({ orgId: foundingDiscounts.orgId });
  if (inserted.length > 0) {
    await record(tx, {
      actorType: 'system',
      actorId: null,
      orgId,
      action: 'billing.founding_started',
      subjectType: 'organization',
      subjectId: orgId,
      data: {
        shape,
        foundingNumber: eligibility.foundingNumber,
        startedAt: startedAt.toISOString(),
        endsAt: endsAt.toISOString(),
        subscriptionId: snap.id,
      },
    });
  }
  return null;
}
