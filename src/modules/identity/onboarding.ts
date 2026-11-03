// Onboarding: a new user picks Seeker or Host once. The account type lives in app.users and is
// mirrored to Clerk's public metadata (read by the proxy from the session token). It is never
// changed afterwards, and `operator` can't be chosen: operators exist only by invitation.
import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { type Db, withTx } from '@/lib/db';
import { badRequest, conflict, notFound } from '@/lib/errors';
import { record } from '@/modules/audit';
import { createOrganization, findHostMembership, organizationNameSchema } from '@/modules/orgs';
import type { ClerkAdmin } from './clerk-admin';
import { users } from './schema';

const adultAttested = z.literal(true, { error: 'Seekers must confirm they are 18 or older' });

export type AccountTypeInput =
  { accountType: 'seeker'; adultAttested: true } | { accountType: 'host' };

const accountTypeInputSchema: z.ZodType<AccountTypeInput> = z.discriminatedUnion('accountType', [
  z.object({ accountType: z.literal('seeker'), adultAttested }),
  z.object({ accountType: z.literal('host') }),
]);

/** The body of POST /api/v1/onboarding. */
export const onboardingRequestSchema = z.discriminatedUnion('accountType', [
  z.object({ accountType: z.literal('seeker'), adultAttested }),
  z.object({ accountType: z.literal('host'), organizationName: organizationNameSchema }),
]);
export type OnboardingRequest = z.output<typeof onboardingRequestSchema>;

/**
 * Sets the user's account type, once. A seeker's 18+ attestation is stored with its time.
 * Throws bad_request for invalid input (including `operator`), not_found for an unknown or
 * deleted user and conflict if the type is already set. Records `identity.account_type_set`.
 *
 * The Clerk call runs inside the transaction, so if Clerk fails nothing is saved and the user
 * can simply retry.
 */
export async function setAccountType(
  db: Db,
  clerk: ClerkAdmin,
  userId: string,
  input: AccountTypeInput,
): Promise<void> {
  const parsed = accountTypeInputSchema.safeParse(input);
  if (!parsed.success) throw badRequest('Invalid account type', parsed.error.issues);
  const { accountType } = parsed.data;

  await withTx(db, async (tx) => {
    const [updated] = await tx
      .update(users)
      .set({
        accountType,
        adultAttestedAt: accountType === 'seeker' ? sql`now()` : null,
      })
      .where(and(eq(users.id, userId), isNull(users.accountType), isNull(users.deletedAt)))
      .returning({ clerkUserId: users.clerkUserId });

    if (!updated) {
      const [existing] = await tx
        .select({ deletedAt: users.deletedAt })
        .from(users)
        .where(eq(users.id, userId));
      if (!existing || existing.deletedAt) throw notFound('User not found');
      throw conflict('Account type is already set');
    }

    await record(tx, {
      actorType: 'user',
      actorId: userId,
      action: 'identity.account_type_set',
      subjectType: 'user',
      subjectId: userId,
      data: { accountType },
    });
    await clerk.setPublicMetadata(updated.clerkUserId, { account_type: accountType });
  });
}

/**
 * Runs onboarding for POST /api/v1/onboarding and returns where to send the user.
 * A host also creates their first organization. If that failed after the account type was
 * saved, calling this again finishes it; once the host has an organization it throws conflict.
 */
export async function completeOnboarding(
  db: Db,
  clerk: ClerkAdmin,
  userId: string,
  input: OnboardingRequest,
): Promise<{ redirectTo: '/' | '/host' }> {
  if (input.accountType === 'seeker') {
    await setAccountType(db, clerk, userId, { accountType: 'seeker', adultAttested: true });
    return { redirectTo: '/' };
  }

  const [user] = await db
    .select({ accountType: users.accountType, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, userId));
  if (!user || user.deletedAt) throw notFound('User not found');

  if (user.accountType === null) {
    await setAccountType(db, clerk, userId, { accountType: 'host' });
  } else if (user.accountType !== 'host' || (await findHostMembership(db, userId, null))) {
    throw conflict('Account type is already set');
  }

  await createOrganization(db, clerk, { ownerUserId: userId, name: input.organizationName });
  return { redirectTo: '/host' };
}
