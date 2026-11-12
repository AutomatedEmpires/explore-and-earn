// Hosted Checkout (SP2 spec sections 8.7 and 8.8, with FD-7 pricing). A founding host's first
// subscription gets the founding coupon for the interval it chooses (./founding.ts decides);
// everyone else pays the regular price and may enter a Stripe promotion code. There is no free
// period. One open session per org is reused while its parameters match. The account update
// commits before Stripe is called, and a Stripe failure clears it again.
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '@/lib/db';
import { conflict } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { record } from '@/modules/audit';
import { lockOrg } from '@/modules/entitlements';
import type { HostContext } from '@/server/guards';
import { ensureStripeCustomer } from './customers';
import { getFoundingEligibility, shapeOfInterval } from './founding';
import { billingGateway, type BillingGateway } from './gateway';
import {
  appUrl,
  billingUnavailable,
  getAccount,
  getCurrentSubscription,
  transact,
} from './internal';
import { foundingCouponFor, planItems, type BillingInterval, type PlanCode } from './plans';
import { billingAccounts } from './schema';

/** Stripe needs expires_at at least 30 minutes out; 31 survives request latency (decision 16). */
const SESSION_MINUTES = 31;
/** An open session closer than this to expiring is replaced rather than reused. */
const REUSE_MARGIN_MS = 2 * 60 * 1000;

export type CheckoutInput = {
  plan: PlanCode;
  interval: BillingInterval;
  extraSlots: number;
  /**
   * Retired with founding codes (FD-7: signup order decides the founding cohort). Still
   * accepted, so a client that sends one keeps working, and ignored.
   */
  foundingCode?: string;
};

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

  // FD-7: the founding coupon only on an eligible founding host's first subscription, chosen by
  // the interval it starts on. Anyone else (organization 101 and later, or a second
  // introductory period) pays the regular price.
  const eligibility = await getFoundingEligibility(db, orgId);
  const couponId = eligibility.eligible ? foundingCouponFor(i.interval) : null;
  const items = planItems(i.plan, i.interval, i.extraSlots);
  const paramsHash = createHash('sha256')
    .update(
      JSON.stringify({
        plan: i.plan,
        interval: i.interval,
        extraSlots: i.extraSlots,
        couponId,
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
      // Same parameters: keep the session.
      return { kind: 'reuse', url: open.url } as const;
    }

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
    return { kind: 'create', replacedSessionId: open?.id ?? null } as const;
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

  const founding = couponId !== null;
  const metadata: Record<string, string> = { orgId };
  if (eligibility.eligible) {
    metadata.foundingNumber = String(eligibility.foundingNumber);
    metadata.foundingShape = shapeOfInterval(i.interval);
  }

  let session: { id: string; url: string; expiresAt: Date };
  try {
    session = await gw.createCheckoutSession(
      {
        customerId,
        items,
        trialEnd: null,
        couponId,
        // Stripe takes either a coupon or promotion codes, never both.
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
        foundingShape: founding ? shapeOfInterval(i.interval) : null,
        sessionId: session.id,
      },
    });
  });
  return { url: session.url };
}
