// POST /api/v1/onboarding: the signed-in user chooses Seeker (with the 18+ attestation) or
// Host (with their organization's name). Returns where to send them: { redirectTo }. That is
// the `returnTo` they arrived with, the action a guest started before signing up (spec 5.1),
// or else their home: / for a seeker and /host for a host.
import { z } from 'zod';
import { onboardingDestination } from '@/app/onboarding/return-to';
import { unauthorized } from '@/lib/errors';
import { clerkAdmin, completeOnboarding, onboardingRequestSchema } from '@/modules/identity';
import { apiRoute } from '@/server/api';

// onboardingDestination keeps `returnTo` only when it is a path on this site.
const input = onboardingRequestSchema.and(z.object({ returnTo: z.string().max(512).optional() }));
const output = z.object({ redirectTo: z.string().startsWith('/') });

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
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    const done = await completeOnboarding(db, clerkAdmin(), user.id, input);
    const accountType = done.redirectTo === '/host' ? 'host' : 'seeker';
    return { redirectTo: onboardingDestination(accountType, input.returnTo) };
  },
});
