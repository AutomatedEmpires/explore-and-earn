// The Checkout success page (GET /host/billing/complete). The browser's arrival grants
// nothing itself: it only asks Stripe for the session and syncs the subscription Stripe reports,
// so an org is entitled even if no webhook ever arrives.
import type { DbOrTx } from '@/lib/db';
import { notFound } from '@/lib/errors';
import type { HostContext } from '@/server/guards';
import { billingGateway, type BillingGateway } from './gateway';
import { billingUnavailable } from './internal';
import { getSubscriptionState, type SubscriptionState } from './state';
import { syncSubscription } from './sync';

const isMissing = (err: unknown) =>
  err instanceof Error &&
  ((err as { code?: unknown }).code === 'resource_missing' || err.message.startsWith('No such'));

export async function finishCheckout(
  db: DbOrTx,
  ctx: HostContext,
  sessionId: string,
  gw: BillingGateway = billingGateway(),
): Promise<{ status: SubscriptionState['status'] }> {
  let session: Awaited<ReturnType<BillingGateway['retrieveCheckoutSession']>>;
  try {
    session = await gw.retrieveCheckoutSession(sessionId);
  } catch (err) {
    if (isMissing(err)) throw notFound('Checkout session not found');
    throw billingUnavailable(err);
  }
  if (session.metadata.orgId !== ctx.orgId) throw notFound('Checkout session not found');
  if (session.subscriptionId) await syncSubscription(db, session.subscriptionId, gw);
  return { status: (await getSubscriptionState(db, ctx.orgId)).status };
}
