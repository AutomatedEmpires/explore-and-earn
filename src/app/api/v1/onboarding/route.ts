// POST /api/v1/onboarding: the signed-in user chooses Seeker (with their date of birth, for the
// age screen) or Host (with their organization's name). Returns where to send them:
// { redirectTo }. That is the `returnTo` they arrived with, the action a guest started before
// signing up (spec 5.1), or else their home: / for a seeker and /host for a host.
//
// The age screen (legal review 2.6): a refused sign-up answers 403 `forbidden` with
// details.reason `signup_refused` and a message that names no age. The refusal holds on the
// account (lead decision 2026-11-18): every later attempt for it, with any date or as a host,
// from any browser or a direct call, gets the same refusal. The answer also sets a session
// cookie, a second check that refuses the rest of that browser session before the account is
// read. The date of birth is never stored or logged; only an adult's birth year is kept.
//
// Legal acceptance (SP8 spec 8.5, plan Task 24): every document the account type accepts at
// onboarding (ONBOARDING_LEGAL) that has a published version must be in `acceptedLegal` at that
// version, else 400 with details.reason `legal_acceptance_required` and the missing documents.
// That check runs before anything is written or sent to Clerk, after the refusal checks, so a
// refused account still gets the refusal. The acceptances are recorded in the transaction that
// sets the account type (seeker) or creates the organization (host), so they commit with it.
// While no document is published, nothing is required.
import { z } from 'zod';
import { hasSignupRefusal, signupRefusedCookie } from '@/app/onboarding/refusal';
import { onboardingDestination } from '@/app/onboarding/return-to';
import { badRequest, unauthorized } from '@/lib/errors';
import { LEGAL_SLUGS, publishedOnboardingLegal, recordAcceptance } from '@/modules/content';
import {
  clerkAdmin,
  completeOnboarding,
  isSignupRefusal,
  isSignupRefusedAccount,
  onboardingRequestSchema,
  signupRefused,
} from '@/modules/identity';
import { apiRoute, toErrorResponse } from '@/server/api';

const legalItem = z.object({ slug: z.enum(LEGAL_SLUGS), version: z.number().int().min(1) });

// onboardingDestination keeps `returnTo` only when it is a path on this site.
const input = onboardingRequestSchema.and(
  z.object({
    returnTo: z.string().max(512).optional(),
    acceptedLegal: z.array(legalItem).max(8).default([]),
  }),
);
const output = z.object({ redirectTo: z.string().startsWith('/') });
type Output = z.output<typeof output>;

/** The refusal envelope. Its cookie also closes onboarding for the rest of the browser session. */
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

    const required = await publishedOnboardingLegal(db, input.accountType);
    const missing = required.filter(
      (doc) =>
        !input.acceptedLegal.some((item) => item.slug === doc.slug && item.version === doc.version),
    );
    if (missing.length > 0) {
      if (await isSignupRefusedAccount(db, user.id)) return refusal(requestId);
      throw badRequest('Agree to the terms to continue.', {
        reason: 'legal_acceptance_required',
        missing,
      });
    }

    try {
      const done = await completeOnboarding(
        db,
        clerkAdmin(),
        user.id,
        input,
        required.length > 0 ? { inTx: (tx) => recordAcceptance(tx, user.id, required) } : {},
      );
      const accountType = done.redirectTo === '/host' ? 'host' : 'seeker';
      return { redirectTo: onboardingDestination(accountType, input.returnTo) };
    } catch (err) {
      if (isSignupRefusal(err)) return refusal(requestId);
      throw err;
    }
  },
});
