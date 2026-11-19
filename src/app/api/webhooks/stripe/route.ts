// POST /api/webhooks/stripe: Stripe events. The signature is verified on the raw body (400 when
// it fails), each event is applied once, and subscription events enqueue a sync that reads
// Stripe's current state. Answers 200 { received: true } so Stripe stops retrying.
//
// The route declares no `input`, so apiRoute leaves the raw body unread for the signature check.
import { badRequest } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { handleStripeWebhook } from '@/modules/billing';
import { kickWorker } from '@/modules/jobs';
import { apiRoute } from '@/server/api';

const MAX_BODY_BYTES = 1024 * 1024;

export const POST = apiRoute({
  auth: 'none',
  handler: async ({ req, db, requestId }) => {
    const signature = req.headers.get('stripe-signature');
    if (!signature) throw badRequest('Missing Stripe-Signature header');
    if (Number(req.headers.get('content-length') ?? '0') > MAX_BODY_BYTES) {
      throw badRequest('Request body is too large');
    }
    const rawBody = await req.text();
    if (rawBody.length > MAX_BODY_BYTES) throw badRequest('Request body is too large');

    const result = await handleStripeWebhook(db, rawBody, signature);
    if (result === 'applied') kickWorker();
    logger.info('stripe webhook', { requestId, result });
    return { received: true as const };
  },
});
