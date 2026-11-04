// The billing schedules (SP2 spec section 6): monthly invite credits, the founding trial
// correction once launch.public_at is set, and the daily reconcile against Stripe. Each one
// handles every subscription on its own, so one failure never stops the rest.
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { logger } from '@/lib/logger';
import { lockOrg } from '@/modules/entitlements';
import { getSetting } from '@/modules/settings';
import { raiseAlert } from '@/modules/trust';
import { billingGateway, type BillingGateway } from './gateway';
import { ENTITLED_STATUSES, addDays, parseLaunchAt, transact, type SubscriptionRow } from './internal';
import { FOUNDING_COUPON_ID } from './plans';
import { subscriptions } from './schema';
import { grantMonthCredits, syncFromStripe, syncSubscription } from './sync';

/** billing.grant_monthly_credits: this month's credits for every entitled org (idempotent). */
export async function grantMonthlyCredits(db: DbOrTx, now: Date = new Date()): Promise<number> {
  const rows = await db
    .select({ orgId: subscriptions.orgId, plan: subscriptions.plan })
    .from(subscriptions)
    .where(inArray(subscriptions.status, [...ENTITLED_STATUSES]));
  let granted = 0;
  for (const r of rows) {
    try {
      await transact(db, async (tx) => {
        await lockOrg(tx, r.orgId);
        await grantMonthCredits(tx, r.orgId, r.plan, now);
      });
      granted += 1;
    } catch (err) {
      logger.error('billing: monthly credits failed for an org', { orgId: r.orgId, error: err });
    }
  }
  return granted;
}

const unix = (d: Date) => Math.floor(d.getTime() / 1000);

/**
 * billing.apply_launch_date (spec section 8.7): once launch.public_at is set, each trialing
 * founding subscription's trial should end at max(launch, sign-up) + founding.free_days. A
 * subscription already there, or whose target has passed, is skipped with no Stripe call
 * (Review Focus 5); a Stripe error alerts and the loop goes on, so the job never fails in a loop.
 */
export async function applyLaunchDate(
  db: DbOrTx,
  now: Date = new Date(),
  gw: BillingGateway = billingGateway(),
): Promise<{ updated: number; skipped: number; failed: number }> {
  const out = { updated: 0, skipped: 0, failed: 0 };
  const launch = parseLaunchAt(await getSetting(db, 'launch.public_at'));
  if (!launch) return out;
  const freeDays = await getSetting(db, 'founding.free_days');

  const rows = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.status, 'trialing'), eq(subscriptions.couponId, FOUNDING_COUPON_ID)));
  for (const row of rows) {
    const signedUp = row.stripeCreatedAt ?? row.createdAt;
    const target = addDays(new Date(Math.max(launch.getTime(), signedUp.getTime())), freeDays);
    if (row.trialEnd?.getTime() === target.getTime() || target <= now) {
      out.skipped += 1;
      continue;
    }
    try {
      await gw.updateSubscription(
        row.stripeSubscriptionId,
        { trialEnd: target, prorationBehavior: 'none' },
        `trial:${row.stripeSubscriptionId}:${unix(target)}`,
      );
      await syncSubscription(db, row.stripeSubscriptionId, gw);
      out.updated += 1;
    } catch (err) {
      out.failed += 1;
      logger.warn('billing: founding trial end not updated', {
        subscriptionId: row.stripeSubscriptionId,
        error: err,
      });
      await alertQuietly(db, {
        kind: 'billing.trial_update_failed',
        message:
          "A founding host's free period couldn't be moved to the launch date. It is retried every hour.",
        data: { orgId: row.orgId, subscriptionId: row.stripeSubscriptionId },
      });
    }
  }
  return out;
}

/** A warning alert that never throws (a broken alert must not stop the loop). */
async function alertQuietly(
  db: DbOrTx,
  a: { kind: string; message: string; data: Record<string, unknown> },
): Promise<void> {
  try {
    await raiseAlert(db, { severity: 'warning', ...a });
  } catch (err) {
    logger.error('billing: alert failed', { kind: a.kind, error: err });
  }
}

type Fingerprint = Pick<
  SubscriptionRow,
  'status' | 'plan' | 'interval' | 'extraSlots' | 'trialEnd'
>;

const fingerprint = (r: Fingerprint) =>
  JSON.stringify([r.status, r.plan, r.interval, r.extraSlots, r.trialEnd?.getTime() ?? null]);

async function rowOf(db: DbOrTx, stripeId: string): Promise<SubscriptionRow | undefined> {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, stripeId));
  return row;
}

/**
 * billing.reconcile: re-syncs every subscription that hasn't ended, and Stripe subscriptions
 * created in the last 2 days that are missing here (a lost webhook). Any change found is drift
 * and raises a warning alert.
 */
export async function reconcile(
  db: DbOrTx,
  now: Date = new Date(),
  gw: BillingGateway = billingGateway(),
): Promise<{ checked: number; drifted: number; failed: number }> {
  const out = { checked: 0, drifted: 0, failed: 0 };
  const open = await db.select().from(subscriptions).where(isNull(subscriptions.endedAt));
  const drift = async (orgId: string | null, subscriptionId: string, missing: boolean) => {
    out.drifted += 1;
    await alertQuietly(db, {
      kind: 'billing.drift',
      message: missing
        ? 'Reconcile found a Stripe subscription that was never synced, and synced it.'
        : 'Reconcile found a subscription that differed from Stripe, and synced it.',
      data: { orgId, subscriptionId, missing },
    });
  };

  for (const before of open) {
    out.checked += 1;
    try {
      await syncSubscription(db, before.stripeSubscriptionId, gw);
      const after = await rowOf(db, before.stripeSubscriptionId);
      if (after && fingerprint(after) !== fingerprint(before)) {
        await drift(before.orgId, before.stripeSubscriptionId, false);
      }
    } catch (err) {
      out.failed += 1;
      logger.error('billing: reconcile failed for a subscription', {
        subscriptionId: before.stripeSubscriptionId,
        error: err,
      });
    }
  }

  const recent = await gw.listSubscriptionsCreatedSince(addDays(now, -2));
  const ids = recent.map((s) => s.id);
  const known = new Set(
    ids.length === 0
      ? []
      : (
          await db
            .select({ id: subscriptions.stripeSubscriptionId })
            .from(subscriptions)
            .where(inArray(subscriptions.stripeSubscriptionId, ids))
        ).map((r) => r.id),
  );
  for (const id of ids) {
    if (known.has(id)) continue;
    out.checked += 1;
    try {
      const result = await syncFromStripe(db, id, gw);
      if (result && (await rowOf(db, id))) await drift(result.orgId, id, true);
    } catch (err) {
      out.failed += 1;
      logger.error('billing: reconcile failed for a missing subscription', {
        subscriptionId: id,
        error: err,
      });
    }
  }
  return out;
}
