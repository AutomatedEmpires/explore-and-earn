// Stripe webhooks (SP2 spec section 8.8). The signature is verified on the raw body, and each
// event is applied once (webhook_events, keyed by Stripe's event id). Subscription events only
// enqueue a sync, which reads Stripe's current state; every other event is emitted as
// `billing.stripe_event` for later sub-projects.
import { sql } from 'drizzle-orm';
import { queryRows, type DbOrTx } from '@/lib/db';
import { badRequest } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { emit, enqueue } from '@/modules/jobs';
import { billingGateway, type BillingGateway, type WebhookEvent } from './gateway';
import { transact } from './internal';

export const SYNC_TOPIC = 'billing.sync_subscription';

export type SyncJob = { subscriptionId: string; notify?: 'payment_failed' | 'trial_ending' };

function idOf(value: unknown): string | null {
  if (typeof value === 'string' && value !== '') return value;
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = (value as { id: unknown }).id;
    return typeof id === 'string' && id !== '' ? id : null;
  }
  return null;
}

/** The subscription an event is about, when it is one billing syncs. */
function subscriptionOf(evt: WebhookEvent): string | null {
  const o = evt.object;
  if (evt.type.startsWith('customer.subscription.')) return evt.objectId;
  if (evt.type === 'checkout.session.completed') {
    return o.mode === 'subscription' ? idOf(o.subscription) : null;
  }
  if (evt.type === 'invoice.paid' || evt.type === 'invoice.payment_failed') {
    // Newer API versions moved the invoice's subscription under parent.subscription_details.
    const parent = typeof o.parent === 'object' && o.parent !== null ? o.parent : {};
    const details =
      'subscription_details' in parent &&
      typeof parent.subscription_details === 'object' &&
      parent.subscription_details !== null
        ? (parent.subscription_details as Record<string, unknown>)
        : {};
    return idOf(o.subscription) ?? idOf(details.subscription);
  }
  return null;
}

function notifyOf(type: string): SyncJob['notify'] {
  if (type === 'invoice.payment_failed') return 'payment_failed';
  if (type === 'customer.subscription.trial_will_end') return 'trial_ending';
  return undefined;
}

/**
 * Verifies and records one webhook delivery. Returns 'duplicate' for an event already applied.
 * Throws `bad_request` for a bad signature.
 */
export async function handleStripeWebhook(
  db: DbOrTx,
  rawBody: string,
  signature: string,
  gw: BillingGateway = billingGateway(),
): Promise<'applied' | 'duplicate'> {
  let evt: WebhookEvent;
  try {
    evt = gw.constructEvent(rawBody, signature);
  } catch (err) {
    logger.warn('stripe webhook: verification failed', {
      reason: err instanceof Error ? err.message : String(err),
    });
    throw badRequest('Invalid webhook signature');
  }

  return transact(db, async (tx) => {
    const inserted = await queryRows<{ id: string }>(
      tx,
      sql`insert into app.webhook_events (id, source, event_type)
          values (${evt.id}, 'stripe', ${evt.type})
          on conflict (id) do nothing
          returning id`,
    );
    if (inserted.length === 0) return 'duplicate' as const;

    const subscriptionId = subscriptionOf(evt);
    if (subscriptionId) {
      const notify = notifyOf(evt.type);
      const job: SyncJob = notify ? { subscriptionId, notify } : { subscriptionId };
      await enqueue(tx, { topic: SYNC_TOPIC, payload: job, dedupeKey: `stripe:${evt.id}` });
    } else {
      await emit(
        tx,
        'billing.stripe_event',
        { eventId: evt.id, type: evt.type, objectId: evt.objectId },
        evt.id,
      );
    }
    return 'applied' as const;
  });
}
