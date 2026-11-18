// POST /api/v1/onboarding: the signed-in user chooses Seeker (with their date of birth, for the
// age screen) or Host (with their organization's name). Returns where to send them:
// { redirectTo }. That is the `returnTo` they arrived with, the action a guest started before
// signing up (spec 5.1), or else their home: / for a seeker and /host for a host.
//
// The age screen (legal review 2.6): a refused sign-up answers 403 `forbidden` with
// details.reason `signup_refused` and a message that names no age, and sets a session cookie.
// Every later attempt in that browser session, with any date or as a host, gets the same
// refusal. The date of birth is never stored or logged; only the birth year is kept.
import { z } from 'zod';
import { hasSignupRefusal, signupRefusedCookie } from '@/app/onboarding/refusal';
import { onboardingDestination } from '@/app/onboarding/return-to';
import { unauthorized } from '@/lib/errors';
import {
  clerkAdmin,
  completeOnboarding,
  isSignupRefusal,
  onboardingRequestSchema,
  signupRefused,
} from '@/modules/identity';
import { apiRoute, toErrorResponse } from '@/server/api';

// onboardingDestination keeps `returnTo` only when it is a path on this site.
const input = onboardingRequestSchema.and(z.object({ returnTo: z.string().max(512).optional() }));
const output = z.object({ redirectTo: z.string().startsWith('/') });
type Output = z.output<typeof output>;

/** The refusal envelope, closing onboarding for the rest of the browser session. */
function refusal(requestId: string): Output {
  const res = toErrorResponse(signupRefused(), requestId);
  res.headers.append('set-cookie', signupRefusedCookie());
  // apiRoute sends a returned Response as it is; the schema documents the success body.
  return res as unknown as Output;
}

export const POST = apiRoute({
  auth: 'user',
  input,
  // Sign-up is a sensitive endpoint (spec section 4), and each call writes to Clerk.
  rateLimit: { key: (ctx) => `onboarding:${ctx.user?.id}`, limit: 5, windowSec: 3600 },
  openapi: {
    method: 'POST',
    path: '/api/v1/onboarding',
    summary: 'Choose the account type (once) and, for a host, create the organization',
    output,
  },
  handler: async ({ db, user, input, req, requestId }) => {
    if (!user) throw unauthorized();
    if (hasSignupRefusal(req.headers.get('cookie'))) return refusal(requestId);
    try {
      const done = await completeOnboarding(db, clerkAdmin(), user.id, input);
      const accountType = done.redirectTo === '/host' ? 'host' : 'seeker';
      return { redirectTo: onboardingDestination(accountType, input.returnTo) };
    } catch (err) {
      if (isSignupRefusal(err)) return refusal(requestId);
      throw err;
    }
  },
});
