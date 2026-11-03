// POST /api/webhooks/clerk: Clerk user, organization and membership events, delivered by Svix.
// Verifies the signature, applies the event once (keyed by the svix-id header, which stays the
// same across retries) and audits it. Any non-2xx response makes Clerk retry later, so:
// - an event that can never apply (for example a role we don't map) is recorded as rejected,
//   reported to Sentry and answered with 200, since every retry would fail the same way;
// - an unexpected failure (the database is down) is a 5xx, and Clerk retries it.
//
// apiRoute supplies the request id, the error envelope and Sentry reporting. The route declares
// no `input`, so apiRoute leaves the raw body unread for the signature check.
import { verifyWebhook } from '@clerk/nextjs/webhooks';
import { captureMessage } from '@sentry/nextjs';
import type { NextRequest } from 'next/server';
import { getEnv } from '@/lib/env';
import { badRequest, isAppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { record } from '@/modules/audit';
import { handleClerkEvent, type ClerkEventResult } from '@/modules/identity';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'none',
  handler: async ({ req, db, requestId }) => {
    const eventId = req.headers.get('svix-id') ?? req.headers.get('webhook-id');

    let evt: Awaited<ReturnType<typeof verifyWebhook>>;
    try {
      const signingSecret = getEnv().CLERK_WEBHOOK_SECRET;
      // Next passes a NextRequest; verifyWebhook also accepts any Web Request at runtime, but
      // its declared parameter type only lists the Next request shapes.
      evt = await verifyWebhook(req as NextRequest, signingSecret ? { signingSecret } : undefined);
    } catch (err) {
      logger.warn('clerk webhook: verification failed', {
        requestId,
        reason: err instanceof Error ? err.message : String(err),
      });
      throw badRequest('Invalid webhook signature');
    }
    if (!eventId) throw badRequest('Missing webhook id header');

    let result: ClerkEventResult;
    try {
      result = await handleClerkEvent(
        db,
        { id: eventId, type: evt.type, data: evt.data },
        { requestId },
      );
    } catch (err) {
      if (isAppError(err)) {
        logger.warn('clerk webhook: event failed; Clerk will retry it', {
          requestId,
          eventId,
          type: evt.type,
          code: err.code,
          message: err.message,
        });
      }
      // apiRoute returns the envelope; anything that is not an AppError is logged as a 500.
      throw err;
    }

    if (result === 'rejected') {
      // handleClerkEvent logged the reason and audited it; this raises the alert.
      captureMessage('Clerk webhook event rejected: it can never apply', {
        level: 'error',
        tags: { requestId, eventId, type: evt.type },
      });
    }

    if (result === 'applied') {
      const clerkId =
        typeof evt.data === 'object' && evt.data !== null && 'id' in evt.data
          ? String(evt.data.id)
          : null;
      await record(db, {
        actorType: 'system',
        actorId: null,
        action: 'identity.clerk_webhook',
        subjectType: 'clerk_event',
        subjectId: eventId,
        data: { type: evt.type, clerkId },
        requestId,
      });
    }
    logger.info('clerk webhook', { requestId, eventId, type: evt.type, result });
    return { ok: true as const, result };
  },
});
