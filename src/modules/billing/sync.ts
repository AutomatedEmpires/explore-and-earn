// syncSubscription (SP2 spec section 8.8): reads the subscription from Stripe, so event order
// never matters, then under the org lock upserts the row, swaps plan grants, grants the month's
// invite credits, applies the founding offer (FD-7, ./founding.ts), sets host_since, applies a
// lapse, emits `subscription.changed` and records audit. Webhooks, the success page and the daily
// reconcile all end here.
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import type { DbOrTx, Tx } from '@/lib/db';
import { newId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { record } from '@/modules/audit';
import {
  endGrant,
  getCapacity,
  grant,
  listOpenGrants,
  lockOrg,
  type Actor,
} from '@/modules/entitlements';
import { emit } from '@/modules/jobs';
import { getOrgSummaries } from '@/modules/orgs';
import { listOpenReviewItems, openReviewItem, raiseAlert } from '@/modules/trust';
import { syncFoundingDiscount, type FoundingMismatch } from './founding';
import { billingGateway, type BillingGateway, type SubSnapshot } from './gateway';
import {
  CURRENT_STATUSES,
  isCurrent,
  isEntitled,
  isLapse,
  monthKey,
  startOfNextMonthUtc,
  transact,
  type SubscriptionRow,
} from './internal';
import { notifyBillingContacts } from './notifications';
import {
  PLANS,
  parseLookupKey,
  planLimits,
  type BillingInterval,
  type PlanCode,
} from './plans';
import { billingAccounts, subscriptions } from './schema';

const SYSTEM: Actor = { type: 'system', id: null };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The subject trust review items about an org's billing use (SP2 plan, decision 11). */
export const BILLING_SUBJECT = 'billing_account';

export type ParsedPlan = { plan: PlanCode; interval: BillingInterval; extraSlots: number };

/** The plan a subscription's items describe, or null when any item is not a price billing owns. */
export function parsePlanItems(items: SubSnapshot['items']): ParsedPlan | null {
  let tier: { plan: PlanCode; interval: BillingInterval } | null = null;
  const slots: { plan: PlanCode; interval: BillingInterval; quantity: number }[] = [];
  for (const item of items) {
    const parsed = item.lookupKey ? parseLookupKey(item.lookupKey) : null;
    if (!parsed) return null;
    if (parsed.kind === 'tier') {
      if (tier || item.quantity !== 1) return null;
      tier = { plan: parsed.plan, interval: parsed.interval };
    } else {
      slots.push({ plan: parsed.plan, interval: parsed.interval, quantity: item.quantity });
    }
  }
  if (!tier) return null;
  let extraSlots = 0;
  for (const s of slots) {
    if (s.plan !== tier.plan || s.interval !== tier.interval) return null;
    extraSlots += s.quantity;
  }
  if (extraSlots > 50) return null;
  return { ...tier, extraSlots };
}

/**
 * This month's invite credits for `plan`: the base grant keyed `credits:<orgId>:<YYYY-MM>`
 * (valid until the 1st of next month, UTC), plus a top-up keyed `...:topup:<plan>` when an
 * upgrade raised the month's allowance. Never claws back. Idempotent.
 */
export async function grantMonthCredits(
  tx: DbOrTx,
  orgId: string,
  plan: PlanCode,
  now: Date,
): Promise<void> {
  const ref = `credits:${orgId}:${monthKey(now)}`;
  const want = PLANS[plan].inviteCredits;
  const base = {
    orgId,
    kind: 'invite_credit' as const,
    source: 'plan' as const,
    sourceRef: ref,
    validFrom: now,
    validUntil: startOfNextMonthUtc(now),
    actor: SYSTEM,
  };
  await grant(tx, { ...base, quantity: want, idempotencyKey: ref, reason: 'Monthly invite credits' });
  const open = await listOpenGrants(tx, orgId, { source: 'plan', kind: 'invite_credit' }, now);
  const total = open.filter((g) => g.sourceRef === ref).reduce((sum, g) => sum + g.quantity, 0);
  if (total < want) {
    await grant(tx, {
      ...base,
      quantity: want - total,
      idempotencyKey: `${ref}:topup:${plan}`,
      reason: 'Invite credits top-up after an upgrade',
    });
  }
}

/** Slots used before a change, for the notifications; 0 when listings isn't loaded. */
async function slotsUsed(tx: Tx, orgId: string, now: Date): Promise<number> {
  try {
    return (await getCapacity(tx, orgId, 'listing_slot', now)).used;
  } catch (err) {
    logger.warn('billing: listing slot usage unavailable', { orgId, error: err });
    return 0;
  }
}

async function openPlanGrants(tx: Tx, orgId: string, now: Date) {
  const open = await listOpenGrants(tx, orgId, { source: 'plan' }, now);
  return open.filter((g) => g.kind === 'listing_slot' || g.kind === 'seat');
}

const PROBLEM_MESSAGES = {
  unknown_price: "A Stripe subscription uses a price Explore&Earn doesn't know, so it granted nothing.",
  duplicate_subscription:
    'An organization has a second current Stripe subscription, which granted nothing.',
  founding_mismatch:
    "A Stripe subscription carries a founding discount the founding rules (FD-7) don't allow. " +
    'Remove the discount in Stripe.',
} as const;

/** Opens one `billing` item per reason and org (a replay adds none) and alerts the Owners. */
async function reportBillingProblem(
  tx: Tx,
  orgId: string,
  reason: keyof typeof PROBLEM_MESSAGES,
  subscriptionId: string,
  detail: { mismatch?: FoundingMismatch } = {},
): Promise<void> {
  const open = await listOpenReviewItems(tx, BILLING_SUBJECT, orgId);
  if (open.some((i) => i.reason === reason)) return;
  const { id } = await openReviewItem(tx, {
    queue: 'billing',
    subjectType: BILLING_SUBJECT,
    subjectId: orgId,
    reason,
    priority: 100,
  });
  await raiseAlert(tx, {
    severity: 'critical',
    kind: `billing.${reason}`,
    message: PROBLEM_MESSAGES[reason],
    data: { itemId: id, orgId, subscriptionId, ...detail },
  });
}

/** The org a subscription belongs to: its metadata, else its customer's billing account. */
async function resolveOrg(db: DbOrTx, snap: SubSnapshot): Promise<string | null> {
  const fromMetadata = snap.metadata.orgId;
  if (fromMetadata && UUID.test(fromMetadata)) {
    const org = (await getOrgSummaries(db, [fromMetadata])).get(fromMetadata);
    if (org) return org.id;
  }
  if (!snap.customerId) return null;
  const [account] = await db
    .select({ orgId: billingAccounts.orgId })
    .from(billingAccounts)
    .where(eq(billingAccounts.stripeCustomerId, snap.customerId));
  return account?.orgId ?? null;
}

export type SyncResult = { orgId: string; changed: boolean };

/**
 * Syncs one subscription from Stripe and returns its org, or null when no org owns it (an
 * Owner alert is raised and nothing is written).
 */
export async function syncFromStripe(
  db: DbOrTx,
  stripeSubscriptionId: string,
  gw: BillingGateway = billingGateway(),
  depth = 0,
): Promise<SyncResult | null> {
  const snap = await gw.retrieveSubscription(stripeSubscriptionId);
  const orgId = await resolveOrg(db, snap);
  if (!orgId) {
    await raiseAlert(db, {
      severity: 'warning',
      kind: 'billing.unknown_customer',
      message: 'A Stripe subscription belongs to no Explore&Earn organization.',
      data: { subscriptionId: snap.id, customerId: snap.customerId },
    });
    return null;
  }

  // Another subscription we still hold as current may have ended without its webhook arriving;
  // refresh it first, so this one isn't mistaken for a duplicate.
  if (depth === 0 && isCurrent(snap.status)) {
    const others = await db
      .select({ id: subscriptions.stripeSubscriptionId })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.orgId, orgId),
          inArray(subscriptions.status, [...CURRENT_STATUSES]),
          ne(subscriptions.stripeSubscriptionId, snap.id),
        ),
      );
    for (const o of others) await syncFromStripe(db, o.id, gw, depth + 1);
  }

  return transact(db, (tx) => applySnapshot(tx, orgId, snap));
}

async function applySnapshot(tx: Tx, orgId: string, snap: SubSnapshot): Promise<SyncResult> {
  await lockOrg(tx, orgId);
  const now = new Date();

  const parsed = parsePlanItems(snap.items);
  if (!parsed) {
    await reportBillingProblem(tx, orgId, 'unknown_price', snap.id);
    return { orgId, changed: false };
  }
  if (isCurrent(snap.status)) {
    const [other] = await tx
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.orgId, orgId),
          inArray(subscriptions.status, [...CURRENT_STATUSES]),
          ne(subscriptions.stripeSubscriptionId, snap.id),
        ),
      );
    if (other) {
      await reportBillingProblem(tx, orgId, 'duplicate_subscription', snap.id);
      return { orgId, changed: false };
    }
  }

  const [prev] = await tx
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, snap.id));

  const values = {
    status: snap.status,
    plan: parsed.plan,
    interval: parsed.interval,
    extraSlots: parsed.extraSlots,
    currentPeriodStart: snap.currentPeriodStart,
    currentPeriodEnd: snap.currentPeriodEnd,
    trialEnd: snap.trialEnd,
    cancelAtPeriodEnd: snap.cancelAtPeriodEnd,
    endedAt: snap.endedAt,
    couponId: snap.couponId,
    stripeCreatedAt: snap.created,
    lastSyncedAt: now,
  };
  const [row] = (await tx
    .insert(subscriptions)
    .values({
      id: newId(),
      orgId,
      stripeSubscriptionId: snap.id,
      ...values,
      activatedAt: snap.activatedAt,
    })
    .onConflictDoUpdate({
      target: subscriptions.stripeSubscriptionId,
      // The first payment is kept once seen, whatever later snapshots say.
      set: { ...values, activatedAt: sql`coalesce(${subscriptions.activatedAt}, excluded.activated_at)` },
    })
    .returning()) as [SubscriptionRow];

  await tx.insert(billingAccounts).values({ orgId }).onConflictDoNothing();
  const [account] = await tx
    .select()
    .from(billingAccounts)
    .where(eq(billingAccounts.orgId, orgId))
    .for('update');
  const accountPatch: Partial<typeof billingAccounts.$inferInsert> = {};

  const entitled = isEntitled(snap.status);
  const wasEntitled = prev !== undefined && isEntitled(prev.status);
  const limits = planLimits(parsed.plan, parsed.extraSlots);
  const planChanged =
    prev !== undefined &&
    (prev.plan !== parsed.plan ||
      prev.interval !== parsed.interval ||
      prev.extraSlots !== parsed.extraSlots);

  if (entitled) {
    // Plan grants: one listing_slot and one seat grant for this subscription at these sizes.
    const open = await openPlanGrants(tx, orgId, now);
    const holds = (kind: 'listing_slot' | 'seat', quantity: number) =>
      open.some((g) => g.kind === kind && g.quantity === quantity && g.sourceRef === snap.id);
    const unchanged =
      open.length === 2 && holds('listing_slot', limits.listingSlots) && holds('seat', limits.seats);
    if (!unchanged) {
      const seq = row.planGrantSeq + 1;
      await tx.update(subscriptions).set({ planGrantSeq: seq }).where(eq(subscriptions.id, row.id));
      for (const g of open) await endGrant(tx, g.id, now, SYSTEM);
      for (const [kind, quantity] of [
        ['listing_slot', limits.listingSlots],
        ['seat', limits.seats],
      ] as const) {
        await grant(tx, {
          orgId,
          kind,
          quantity,
          source: 'plan',
          sourceRef: snap.id,
          validFrom: now,
          validUntil: null,
          idempotencyKey: `plan:${snap.id}:${kind}:${quantity}:${seq}`,
          actor: SYSTEM,
          reason: `${parsed.plan} plan`,
        });
      }
    }

    await grantMonthCredits(tx, orgId, parsed.plan, now);

    if (!account?.hostSince) accountPatch.hostSince = snap.startDate;
    // The Checkout that led here is done.
    if (account?.openCheckoutSessionId) {
      Object.assign(accountPatch, {
        openCheckoutSessionId: null,
        openCheckoutUrl: null,
        openCheckoutExpiresAt: null,
        openCheckoutParamsHash: null,
      });
    }
  }

  // Lapse: this was the org's entitled subscription and nothing else is current.
  let lapsedClosing: number | null = null;
  if (isLapse(snap.status) && wasEntitled) {
    const [otherCurrent] = await tx
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.orgId, orgId),
          inArray(subscriptions.status, [...CURRENT_STATUSES]),
          ne(subscriptions.id, row.id),
        ),
      );
    if (!otherCurrent) {
      lapsedClosing = await slotsUsed(tx, orgId, now);
      for (const g of await openPlanGrants(tx, orgId, now)) await endGrant(tx, g.id, now, SYSTEM);
      accountPatch.hostSince = null;
    }
  }

  // FD-7: lock the founding shape at the first paid activation, end it early on an interval
  // change or when its subscription ends, and report a founding coupon the rules don't allow.
  // The plan itself still applies: the host is not refused service for a discount Stripe holds.
  const mismatch = await syncFoundingDiscount(tx, { orgId, snap, interval: parsed.interval, now });
  if (mismatch) {
    await reportBillingProblem(tx, orgId, 'founding_mismatch', snap.id, { mismatch });
  }

  if (Object.keys(accountPatch).length > 0) {
    await tx.update(billingAccounts).set(accountPatch).where(eq(billingAccounts.orgId, orgId));
  }

  const changed = prev === undefined || prev.status !== snap.status || planChanged;
  if (changed) {
    await emit(
      tx,
      'subscription.changed',
      { orgId, status: snap.status, plan: entitled ? parsed.plan : null },
      newId(),
    );
  }

  await record(tx, {
    actorType: 'system',
    actorId: null,
    orgId,
    action: 'billing.subscription_synced',
    subjectType: 'subscription',
    subjectId: row.id,
    data: {
      stripeSubscriptionId: snap.id,
      status: snap.status,
      previousStatus: prev?.status ?? null,
      plan: parsed.plan,
      interval: parsed.interval,
      extraSlots: parsed.extraSlots,
    },
  });

  if (entitled && !wasEntitled) {
    await notifyBillingContacts(tx, orgId, 'billing.subscription_started', {
      plan: parsed.plan,
      interval: parsed.interval,
      trialEnd: snap.trialEnd?.toISOString() ?? null,
    });
  } else if (entitled && wasEntitled && planChanged) {
    // When listings must close some to fit, listings.enforce_slot_limit sends this instead,
    // naming the listings it closed (SP2 plan, decision 3).
    if ((await slotsUsed(tx, orgId, now)) <= limits.listingSlots) {
      await notifyBillingContacts(tx, orgId, 'billing.plan_changed', {
        plan: parsed.plan,
        interval: parsed.interval,
        extraSlots: parsed.extraSlots,
      });
    }
  }
  if (lapsedClosing !== null) {
    await notifyBillingContacts(tx, orgId, 'billing.subscription_ended', {
      closingListings: lapsedClosing,
    });
  }

  return { orgId, changed };
}

/** Syncs one subscription from Stripe's own data (spec section 3). */
export async function syncSubscription(
  db: DbOrTx,
  stripeSubscriptionId: string,
  gw: BillingGateway = billingGateway(),
): Promise<void> {
  await syncFromStripe(db, stripeSubscriptionId, gw);
}
