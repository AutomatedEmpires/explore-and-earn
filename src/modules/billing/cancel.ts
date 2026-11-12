// Immediate cancellation and sanctions (SP2 spec sections 6 and 8.6, plan decision 4). A ban
// sets the org status in the caller's transaction and queues the Stripe cancellation, which runs
// outside it (billing.cancel_subscription); the sync that follows applies the lapse.
import type { DbOrTx } from '@/lib/db';
import type { Actor } from '@/modules/entitlements';
import { enqueue } from '@/modules/jobs';
import { setOrgStatus } from '@/modules/orgs';
import { billingGateway, type BillingGateway, type CardChecks } from './gateway';
import { getAccount, getCurrentSubscription, transact } from './internal';
import { syncSubscription } from './sync';

export const CANCEL_TOPIC = 'billing.cancel_subscription';

/** Cancels the org's current subscription now, without proration, then syncs it. */
export async function cancelSubscriptionNow(
  db: DbOrTx,
  orgId: string,
  gw: BillingGateway = billingGateway(),
): Promise<void> {
  const sub = await getCurrentSubscription(db, orgId);
  if (!sub) return;
  await gw.cancelSubscription(sub.stripeSubscriptionId, `cancel:${sub.stripeSubscriptionId}`);
  await syncSubscription(db, sub.stripeSubscriptionId, gw);
}

/** Suspends or bans the org. A ban also cancels its subscription (queued, after commit). */
export async function sanctionOrg(
  db: DbOrTx,
  orgId: string,
  action: 'suspend' | 'ban',
  actor: Actor,
): Promise<void> {
  await transact(db, async (tx) => {
    await setOrgStatus(tx, orgId, action === 'ban' ? 'banned' : 'suspended', actor);
    if (action === 'ban') {
      await enqueue(tx, { topic: CANCEL_TOPIC, payload: { orgId }, dedupeKey: `cancel:${orgId}:ban` });
    }
  });
}

/** The default card's Stripe checks, for business verification. No customer, no card. */
export async function getCardChecks(
  db: DbOrTx,
  orgId: string,
  gw: BillingGateway = billingGateway(),
): Promise<CardChecks> {
  const account = await getAccount(db, orgId);
  if (!account?.stripeCustomerId) return { hasCard: false, cvcCheck: null, postalCheck: null };
  return gw.getDefaultCardChecks(account.stripeCustomerId);
}
