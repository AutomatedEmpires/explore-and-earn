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

/** What a subject handler knows about the decision that sanctioned the org. */
export type SanctionMeta = {
  reviewItemId?: string;
  reason?: string;
  endsAt?: Date | null;
};

export function sanctionMetaFrom(data: unknown): SanctionMeta {
  if (!data || typeof data !== 'object') return {};
  const d = data as Record<string, unknown>;
  const reviewItemId = typeof d.reviewItemId === 'string' ? d.reviewItemId : undefined;
  const reason = typeof d.reason === 'string' ? d.reason : undefined;
  let endsAt: Date | null | undefined;
  if (d.endsAt instanceof Date) endsAt = d.endsAt;
  else if (typeof d.endsAt === 'string') endsAt = new Date(d.endsAt);
  else if (d.endsAt === null) endsAt = null;
  return { reviewItemId, reason, endsAt };
}

/** Suspends or bans the org. A ban also cancels its subscription (queued, after commit). */
export async function sanctionOrg(
  db: DbOrTx,
  orgId: string,
  action: 'suspend' | 'ban',
  actor: Actor,
  meta?: SanctionMeta,
): Promise<void> {
  await transact(db, async (tx) => {
    await setOrgStatus(tx, orgId, action === 'ban' ? 'banned' : 'suspended', actor, meta?.reason, {
      reviewItemId: meta?.reviewItemId ?? null,
      endsAt: action === 'ban' ? null : (meta?.endsAt ?? null),
    });
    if (action === 'ban') {
      await enqueue(tx, { topic: CANCEL_TOPIC, payload: { orgId }, dedupeKey: `cancel:${orgId}:ban` });
    }
  });
}

/** The operator sanction. A ban never carries an end date. */
export async function suspendOrganization(
  db: DbOrTx,
  i: {
    orgId: string;
    action: 'suspend' | 'ban';
    reviewItemId: string;
    reason: string;
    endsAt: Date | null;
    actor: Actor;
  },
): Promise<void> {
  await sanctionOrg(db, i.orgId, i.action, i.actor, {
    reviewItemId: i.reviewItemId,
    reason: i.reason,
    endsAt: i.action === 'ban' ? null : i.endsAt,
  });
}

/** Lifts a suspension or ban. */
export async function restoreOrganization(
  db: DbOrTx,
  orgId: string,
  meta?: { reviewItemId?: string; actor?: Actor },
): Promise<void> {
  await setOrgStatus(
    db,
    orgId,
    'active',
    meta?.actor ?? { type: 'system', id: null },
    'restored',
    { reviewItemId: meta?.reviewItemId ?? null, endsAt: null },
  );
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
