// POST /api/webhooks/clerk: Clerk user, organization and membership events, delivered by Svix.
// Verifies the signature, applies the event once (keyed by the svix-id header, which stays the
// same across retries) and audits it. Any non-2xx response makes Clerk retry later.
import { verifyWebhook } from '@clerk/nextjs/webhooks';
import type { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { type ErrorCode, isAppError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { record } from '@/modules/audit';
import { handleClerkEvent } from '@/modules/identity';

function errorResponse(
  status: number,
  code: ErrorCode,
  message: string,
  requestId: string,
  details?: unknown,
): Response {
  return Response.json(
    { error: { code, message, ...(details === undefined ? {} : { details }), requestId } },
    { status, headers: { 'x-request-id': requestId } },
  );
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = newId();
  const eventId = req.headers.get('svix-id') ?? req.headers.get('webhook-id');

  let evt: Awaited<ReturnType<typeof verifyWebhook>>;
  try {
    const signingSecret = getEnv().CLERK_WEBHOOK_SECRET;
    evt = await verifyWebhook(req, signingSecret ? { signingSecret } : undefined);
  } catch (err) {
    logger.warn('clerk webhook: verification failed', {
      requestId,
      reason: err instanceof Error ? err.message : String(err),
    });
    return errorResponse(400, 'bad_request', 'Invalid webhook signature', requestId);
  }
  if (!eventId) {
    return errorResponse(400, 'bad_request', 'Missing webhook id header', requestId);
  }

  try {
    const db = getDb();
    const result = await handleClerkEvent(db, { id: eventId, type: evt.type, data: evt.data });
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
    return Response.json({ ok: true, result }, { headers: { 'x-request-id': requestId } });
  } catch (err) {
    if (isAppError(err)) {
      logger.warn('clerk webhook: event rejected', {
        requestId,
        eventId,
        type: evt.type,
        code: err.code,
        message: err.message,
      });
      return errorResponse(err.status, err.code, err.message, requestId, err.details);
    }
    logger.error('clerk webhook: failed', { requestId, eventId, type: evt.type, err });
    return errorResponse(500, 'internal', 'Internal error', requestId);
  }
}
