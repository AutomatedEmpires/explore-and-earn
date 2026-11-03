// POST /api/v1/onboarding: the signed-in user chooses Seeker (with the 18+ attestation) or
// Host (with their organization's name). Returns where to send them: { redirectTo }.
//
// The shared apiRoute wrapper (Task 11) is built in parallel; until it lands this route does
// its own error envelope and Origin check, the same way. Switch it to apiRoute({ auth: 'user' }).
import { getDb } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { badRequest, forbidden, isAppError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { clerkAdmin, completeOnboarding, onboardingRequestSchema } from '@/modules/identity';
import { requireUser } from '@/server/guards';

function errorResponse(err: unknown, requestId: string): Response {
  if (!isAppError(err)) logger.error('onboarding failed', { requestId, err });
  const e = isAppError(err)
    ? { status: err.status, code: err.code, message: err.message, details: err.details }
    : { status: 500, code: 'internal', message: 'Internal error', details: undefined };
  return Response.json(
    {
      error: {
        code: e.code,
        message: e.message,
        ...(e.details === undefined ? {} : { details: e.details }),
        requestId,
      },
    },
    { status: e.status, headers: { 'x-request-id': requestId } },
  );
}

/** Rejects a browser request from another site (CSRF). Non-browser clients send no Origin. */
function checkOrigin(req: Request): void {
  const origin = req.headers.get('origin');
  if (!origin) return;
  const env = getEnv();
  const allowed = new Set([new URL(env.APP_URL).origin, `https://${env.ADMIN_HOST}`]);
  if (!allowed.has(origin)) throw forbidden('Cross-site request rejected');
}

export async function POST(req: Request): Promise<Response> {
  const requestId = newId();
  try {
    checkOrigin(req);
    const user = await requireUser();

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw badRequest('Request body must be JSON');
    }
    const input = onboardingRequestSchema.safeParse(body);
    if (!input.success) throw badRequest('Invalid onboarding request', input.error.issues);

    const result = await completeOnboarding(getDb(), clerkAdmin(), user.id, input.data);
    return Response.json(result, { headers: { 'x-request-id': requestId } });
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
