// Hosted Checkout (SP2 spec sections 8.7 and 8.8). Founding pricing comes from a held founding
// code, or from a founder returning within the return window; before launch a code is required.
// One open session per org is reused while its parameters match. The founding hold and the
// account update commit before Stripe is called, and a Stripe failure releases the hold.
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '@/lib/db';
import { badRequest, conflict } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { record } from '@/modules/audit';
import { lockOrg } from '@/modules/entitlements';
import { getSetting } from '@/modules/settings';
import type { HostContext } from '@/server/guards';
import { ensureStripeCustomer } from './customers';
import {
  hashFoundingCode,
  holdFoundingCode,
  normalizeFoundingCode,
  releaseHold,
} from './founding';
import { billingGateway, type BillingGateway } from './gateway';
import {
  addDays,
  addMonths,
  appUrl,
  billingUnavailable,
  getAccount,
  getCurrentSubscription,
  parseLaunchAt,
  transact,
  type AccountRow,
} from './internal';
import { FOUNDING_COUPON_ID, planItems, type BillingInterval, type PlanCode } from './plans';
import { billingAccounts } from './schema';

/** Stripe needs expires_at at least 30 minutes out; 31 survives request latency (decision 16). */
const SESSION_MINUTES = 31;
/** An open session closer than this to expiring is replaced rather than reused. */
const REUSE_MARGIN_MS = 2 * 60 * 1000;
/** Stripe's limit is 730 days; with no launch date yet the trial waits as long as it can. */
const NO_LAUNCH_TRIAL_DAYS = 729;

export type CheckoutInput = {
  plan: PlanCode;
  interval: BillingInterval;
  extraSlots: number;
  foundingCode?: string;
};

/** `max(launchAt, now) + freeDays` days, or `now + 729` days while launch isn't set. */
export function computeFoundingTrialEnd(launchAt: Date | null, now: Date, freeDays: number): Date {
  if (!launchAt) return addDays(now, NO_LAUNCH_TRIAL_DAYS);
  return addDays(new Date(Math.max(launchAt.getTime(), now.getTime())), freeDays);
}

/** A founder whose subscription lapsed less than the return window ago. */
export function isReturningFounder(
  account: AccountRow | null,
  now: Date,
  windowMonths: number,
): boolean {
  return (
    account?.foundingStatus === 'lapsed' &&
    account.foundingLapsedAt !== null &&
    addMonths(account.foundingLapsedAt, windowMonths) > now
  );
}

type Pricing =
  | { mode: 'none' }
  | { mode: 'returning'; trialEnd: Date | null }
  | { mode: 'code'; normalizedCode: string; trialEnd: Date };

async function choosePricing(
  db: Db,
  orgId: string,
  foundingCode: string | undefined,
  now: Date,
): Promise<Pricing> {
  const launchAt = parseLaunchAt(await getSetting(db, 'launch.public_at'));
  const freeDays = await getSetting(db, 'founding.free_days');
  const windowMonths = await getSetting(db, 'founding.return_window_months');

  if (isReturningFounder(await getAccount(db, orgId), now, windowMonths)) {
    const inFreePeriod = launchAt === null || now < addDays(launchAt, freeDays);
    return {
      mode: 'returning',
      trialEnd: inFreePeriod ? computeFoundingTrialEnd(launchAt, now, freeDays) : null,
    };
  }
  if (foundingCode !== undefined && foundingCode.trim() !== '') {
    const normalizedCode = normalizeFoundingCode(foundingCode);
    if (!normalizedCode) throw badRequest("That code isn't valid.", { reason: 'code_invalid' });
    return {
      mode: 'code',
      normalizedCode,
      trialEnd: computeFoundingTrialEnd(launchAt, now, freeDays),
    };
  }
  if (launchAt === null || launchAt > now) {
    throw badRequest('Enter your founding host code to subscribe before launch.', {
      reason: 'code_required',
    });
  }
  return { mode: 'none' };
}

const hasSubscription = () =>
  conflict('You already have a plan. Change it from Billing instead.', {
    reason: 'has_subscription',
  });

/** Creates (or reuses) the org's Checkout session and returns its URL. */
export async function createCheckout(
  db: Db,
  ctx: HostContext,
  i: CheckoutInput,
  gw: BillingGateway = billingGateway(),
): Promise<{ url: string }> {
  const orgId = ctx.orgId;
  const now = new Date();
  if (await getCurrentSubscription(db, orgId)) throw hasSubscription();

  const pricing = await choosePricing(db, orgId, i.foundingCode, now);
  const items = planItems(i.plan, i.interval, i.extraSlots);
  const paramsHash = createHash('sha256')
    .update(
      JSON.stringify({
        plan: i.plan,
        interval: i.interval,
        extraSlots: i.extraSlots,
        mode: pricing.mode,
        code: pricing.mode === 'code' ? hashFoundingCode(pricing.normalizedCode) : null,
      }),
    )
    .digest('hex');

  let customerId: string;
  try {
    customerId = await ensureStripeCustomer(db, orgId, gw);
  } catch (err) {
    logger.error('billing: Stripe customer could not be created', { orgId, error: err });
    throw billingUnavailable(err);
  }

  const expiresAt = new Date(now.getTime() + SESSION_MINUTES * 60 * 1000);
  const plan = await transact(db, async (tx) => {
    await lockOrg(tx, orgId);
    if (await getCurrentSubscription(tx, orgId)) throw hasSubscription();
    const account = await getAccount(tx, orgId, { forUpdate: true });

    let open: { id: string; url: string; expiresAt: Date } | null = null;
    if (
      account?.openCheckoutSessionId &&
      account.openCheckoutUrl &&
      account.openCheckoutExpiresAt &&
      account.openCheckoutExpiresAt.getTime() > now.getTime() + REUSE_MARGIN_MS
    ) {
      open = {
        id: account.openCheckoutSessionId,
        url: account.openCheckoutUrl,
        expiresAt: account.openCheckoutExpiresAt,
      };
    }

    if (open && account?.openCheckoutParamsHash === paramsHash) {
      // Same parameters: keep the session, and its code held for as long as it lives.
      if (pricing.mode === 'code') {
        await holdFoundingCode(tx, { orgId, code: pricing.normalizedCode, until: open.expiresAt });
      }
      return { kind: 'reuse', url: open.url } as const;
    }

    await releaseHold(tx, orgId);
    const codeId =
      pricing.mode === 'code'
        ? (await holdFoundingCode(tx, { orgId, code: pricing.normalizedCode, until: expiresAt }))
            .codeId
        : null;
    const pending = {
      openCheckoutSessionId: null,
      openCheckoutUrl: null,
      openCheckoutExpiresAt: expiresAt,
      openCheckoutParamsHash: paramsHash,
    };
    await tx
      .insert(billingAccounts)
      .values({ orgId, ...pending })
      .onConflictDoUpdate({ target: billingAccounts.orgId, set: pending });
    return { kind: 'create', replacedSessionId: open?.id ?? null, codeId } as const;
  });

  if (plan.kind === 'reuse') return { url: plan.url };

  if (plan.replacedSessionId) {
    try {
      await gw.expireCheckoutSession(plan.replacedSessionId);
    } catch (err) {
      // It expires on its own within 31 minutes; a completed one would show up as a
      // duplicate subscription, which sync reports.
      logger.warn('billing: could not expire the replaced Checkout session', { orgId, error: err });
    }
  }

  const founding = pricing.mode !== 'none';
  const metadata: Record<string, string> = { orgId };
  if (plan.codeId) metadata.foundingCodeId = plan.codeId;
  if (pricing.mode === 'returning') metadata.foundingReturn = 'true';

  let session: { id: string; url: string; expiresAt: Date };
  try {
    session = await gw.createCheckoutSession(
      {
        customerId,
        items,
        trialEnd: pricing.mode === 'none' ? null : pricing.trialEnd,
        couponId: founding ? FOUNDING_COUPON_ID : null,
        allowPromotionCodes: !founding,
        metadata,
        clientReferenceId: orgId,
        successUrl: appUrl('/host/billing/complete?session_id={CHECKOUT_SESSION_ID}'),
        cancelUrl: appUrl('/host/billing/plans'),
        expiresAt,
      },
      `checkout:${orgId}:${paramsHash}:${Math.floor(expiresAt.getTime() / 1000)}`,
    );
  } catch (err) {
    logger.error('billing: Checkout session could not be created', { orgId, error: err });
    await transact(db, async (tx) => {
      await releaseHold(tx, orgId);
      await tx
        .update(billingAccounts)
        .set({
          openCheckoutSessionId: null,
          openCheckoutUrl: null,
          openCheckoutExpiresAt: null,
          openCheckoutParamsHash: null,
        })
        .where(eq(billingAccounts.orgId, orgId));
    });
    throw billingUnavailable(err);
  }

  await transact(db, async (tx) => {
    await tx
      .update(billingAccounts)
      .set({ openCheckoutSessionId: session.id, openCheckoutUrl: session.url })
      .where(eq(billingAccounts.orgId, orgId));
    await record(tx, {
      actorType: 'user',
      actorId: ctx.user.id,
      orgId,
      action: 'billing.checkout_started',
      subjectType: 'organization',
      subjectId: orgId,
      data: {
        plan: i.plan,
        interval: i.interval,
        extraSlots: i.extraSlots,
        founding,
        sessionId: session.id,
      },
    });
  });
  return { url: session.url };
}
