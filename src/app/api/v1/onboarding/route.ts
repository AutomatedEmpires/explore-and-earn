// POST /api/v1/onboarding: the signed-in user chooses Seeker (with the 18+ attestation) or
// Host (with their organization's name). Returns where to send them: { redirectTo }.
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { clerkAdmin, completeOnboarding, onboardingRequestSchema } from '@/modules/identity';
import { apiRoute } from '@/server/api';

const output = z.object({ redirectTo: z.enum(['/', '/host']) });

export const POST = apiRoute({
  auth: 'user',
  input: onboardingRequestSchema,
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
    return completeOnboarding(db, clerkAdmin(), user.id, input);
  },
});
