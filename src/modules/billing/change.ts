// Plan changes (SP2 spec section 8.6). The change and its keep list are stored as `pending`
// before Stripe is called, and stay pending until listings has enforced the new slot limit and
// called settlePendingChange (SP2 plan, decision 2), so the keep list survives a crash between
// the Stripe call and enforcement.
import { and, eq } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { badRequest, conflict } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { record } from '@/modules/audit';
import { getCapacity, lockOrg } from '@/modules/entitlements';
import { billingGateway, isBillingCardError, type BillingGateway } from './gateway';
import {
  billingUnavailable,
  getAccount,
  getCurrentSubscription,
  isEntitled,
  transact,
  type SubscriptionRow,
} from './internal';
import {
  monthlyEquivalentCents,
  planItems,
  planLimits,
  type BillingInterval,
  type PlanCode,
} from './plans';
import { billingChanges } from './schema';
import { getSubscriptionState, type SubscriptionState } from './state';
import { syncSubscription } from './sync';

export type PlanChoice = { plan: PlanCode; interval: BillingInterval; extraSlots: number };

/** Lists the org's slot holders (its in-review and active listings). */
export type SlotHolderSource = (db: DbOrTx, orgId: string) => Promise<string[]>;

let slotHolders: SlotHolderSource | null = null;

/**
 * Registers who holds the org's listing slots, so a keep list can name only them. Listings
 * registers it at module load (billing can't import listings).
 */
export function registerSlotHolderSource(fn: SlotHolderSource): void {
  slotHolders = fn;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The org's entitled subscription, which a plan change applies to. */
async function requirePlan(db: DbOrTx, orgId: string): Promise<SubscriptionRow> {
  const sub = await getCurrentSubscription(db, orgId);
  if (!sub || !isEntitled(sub.status)) {
    throw conflict('Choose a plan first. You can change it once you have one.', {
      reason: 'no_subscription',
    });
  }
  return sub;
}

const isUpgrade = (from: PlanChoice, to: PlanChoice) =>
  monthlyEquivalentCents(to.plan, to.interval, to.extraSlots) >
  monthlyEquivalentCents(from.plan, from.interval, from.extraSlots);

const choiceOf = (s: SubscriptionRow): PlanChoice => ({
  plan: s.plan,
  interval: s.interval,
  extraSlots: s.extraSlots,
});

/** What the change costs, the new limits, and how many listings the host must let go. */
export async function previewChange(
  db: DbOrTx,
  orgId: string,
  i: PlanChoice,
  gw: BillingGateway = billingGateway(),
): Promise<{
  dueNowCents: number;
  nextInvoiceCents: number;
  nextInvoiceAt: Date;
  newLimits: { listingSlots: number; seats: number; inviteCredits: number };
  mustChooseListings: number;
}> {
  const sub = await requirePlan(db, orgId);
  const account = await getAccount(db, orgId);
  const newLimits = planLimits(i.plan, i.extraSlots);
  const { used } = await getCapacity(db, orgId, 'listing_slot');
  try {
    const preview = await gw.previewInvoice({
      customerId: account?.stripeCustomerId ?? '',
      subscriptionId: sub.stripeSubscriptionId,
      items: planItems(i.plan, i.interval, i.extraSlots),
      prorationBehavior: isUpgrade(choiceOf(sub), i) ? 'always_invoice' : 'create_prorations',
    });
    return { ...preview, newLimits, mustChooseListings: Math.max(0, used - newLimits.listingSlots) };
  } catch (err) {
    logger.error('billing: change preview failed', { orgId, error: err });
    throw billingUnavailable(err);
  }
}

async function validKeepList(
  db: DbOrTx,
  orgId: string,
  ids: string[] | undefined,
  limit: number,
  mustChoose: number,
): Promise<string[]> {
  const refuse = () =>
    badRequest(`Choose up to ${limit} listings to keep.`, {
      reason: 'keep_list_required',
      limit,
      mustChoose,
    });
  if (!ids || ids.length === 0 || ids.length > limit) throw refuse();
  if (new Set(ids).size !== ids.length || !ids.every((id) => UUID.test(id))) throw refuse();
  if (slotHolders) {
    const holders = new Set(await slotHolders(db, orgId));
    if (!ids.every((id) => holders.has(id))) throw refuse();
  } else {
    logger.warn('billing: no slot holder source registered; the keep list was not checked', {
      orgId,
    });
  }
  return ids;
}

const changeInProgress = () =>
  conflict('A plan change is still being applied. Try again in a minute.', {
    reason: 'change_in_progress',
  });

const isUniqueViolation = (err: unknown) => {
  for (let e: unknown = err; e; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === '23505') return true;
  }
  return false;
};

/**
 * Changes the org's plan (spec section 8.6): checks seats and the keep list, stores the pending
 * change, then updates Stripe (key `change:<id>`) and syncs. A declined card fails the change
 * and changes nothing else.
 */
export async function changePlan(
  db: DbOrTx,
  i: PlanChoice & { orgId: string; keepListingIds?: string[]; actorUserId: string },
  gw: BillingGateway = billingGateway(),
): Promise<{ status: 'applied' | 'failed'; subscription: SubscriptionState }> {
  const orgId = i.orgId;
  const sub = await requirePlan(db, orgId);
  const from = choiceOf(sub);
  const to: PlanChoice = { plan: i.plan, interval: i.interval, extraSlots: i.extraSlots };
  if (from.plan === to.plan && from.interval === to.interval && from.extraSlots === to.extraSlots) {
    throw badRequest("That's already your plan.", { reason: 'no_change' });
  }
  const limits = planLimits(to.plan, to.extraSlots);

  // 1. Members are never removed automatically.
  const seats = await getCapacity(db, orgId, 'seat');
  if (seats.used > limits.seats) {
    throw conflict(
      `Your team uses ${seats.used} seats and this plan has ${limits.seats}. Remove members first.`,
      { reason: 'seat_limit', limit: limits.seats, used: seats.used },
    );
  }

  // 2. Listings beyond the new limit: the host chooses which to keep.
  const slots = await getCapacity(db, orgId, 'listing_slot');
  const mustChoose = Math.max(0, slots.used - limits.listingSlots);
  const keep =
    mustChoose > 0
      ? await validKeepList(db, orgId, i.keepListingIds, limits.listingSlots, mustChoose)
      : null;

  // 3. One pending change at a time; it is stored before Stripe is called.
  const changeId = newId();
  try {
    await transact(db, async (tx) => {
      await lockOrg(tx, orgId);
      const [pending] = await tx
        .select({ id: billingChanges.id })
        .from(billingChanges)
        .where(and(eq(billingChanges.orgId, orgId), eq(billingChanges.status, 'pending')));
      if (pending) throw changeInProgress();
      await tx.insert(billingChanges).values({
        id: changeId,
        orgId,
        toPlan: to.plan,
        toInterval: to.interval,
        toExtraSlots: to.extraSlots,
        keepListingIds: keep,
        requestedBy: i.actorUserId,
      });
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw changeInProgress();
    throw err;
  }

  const audit = (status: 'applied' | 'failed') =>
    record(db, {
      actorType: 'user',
      actorId: i.actorUserId,
      orgId,
      action: 'billing.plan_changed',
      subjectType: 'billing_change',
      subjectId: changeId,
      data: { changeId, from, to, status },
    });

  const upgrade = isUpgrade(from, to);
  try {
    await gw.updateSubscription(
      sub.stripeSubscriptionId,
      {
        items: planItems(to.plan, to.interval, to.extraSlots),
        prorationBehavior: upgrade ? 'always_invoice' : 'create_prorations',
        ...(upgrade ? { paymentBehavior: 'error_if_incomplete' as const } : {}),
      },
      `change:${changeId}`,
    );
  } catch (err) {
    const card = isBillingCardError(err);
    await db
      .update(billingChanges)
      .set({ status: 'failed', error: card ? err.message : 'Stripe was unavailable' })
      .where(eq(billingChanges.id, changeId));
    await audit('failed');
    if (card) return { status: 'failed', subscription: await getSubscriptionState(db, orgId) };
    logger.error('billing: plan change failed at Stripe', { orgId, changeId, error: err });
    throw billingUnavailable(err);
  }

  try {
    await syncSubscription(db, sub.stripeSubscriptionId, gw);
  } catch (err) {
    // Stripe has the new plan; its webhook (or billing.reconcile) syncs it.
    logger.error('billing: sync after a plan change failed', { orgId, changeId, error: err });
  }
  await audit('applied');
  return { status: 'applied', subscription: await getSubscriptionState(db, orgId) };
}

/** The pending change's keep list; null when nothing is pending or no choice was needed. */
export async function getPendingKeepList(db: DbOrTx, orgId: string): Promise<string[] | null> {
  const [pending] = await db
    .select({ keep: billingChanges.keepListingIds })
    .from(billingChanges)
    .where(and(eq(billingChanges.orgId, orgId), eq(billingChanges.status, 'pending')));
  return pending?.keep ?? null;
}

/** Marks the org's pending change applied, once listings has enforced it. */
export async function settlePendingChange(db: DbOrTx, orgId: string): Promise<void> {
  await db
    .update(billingChanges)
    .set({ status: 'applied' })
    .where(and(eq(billingChanges.orgId, orgId), eq(billingChanges.status, 'pending')));
}
