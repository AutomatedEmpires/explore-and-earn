import { clerkClient } from "@clerk/nextjs/server";

/**
 * Resolved contact details for a Clerk user, used to address notification
 * emails. Both fields are nullable so callers degrade gracefully.
 */
export interface ClerkContact {
  readonly email: string | null;
  readonly name: string | null;
}

/**
 * Best-effort lookup of a Clerk user's primary email + display name by Clerk
 * user id. Returns nulls on any failure so notification side-effects never
 * throw. `clerkUserId` must be a verified id (auth().userId or a DB-resolved
 * clerk_user_id), never decoded from a raw token.
 */
export async function getClerkContact(
  clerkUserId: string,
): Promise<ClerkContact> {
  if (!clerkUserId) {
    return { email: null, name: null };
  }
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(clerkUserId);

    const primaryId = user.primaryEmailAddressId;
    const primary =
      user.emailAddresses.find((entry) => entry.id === primaryId) ??
      user.emailAddresses[0];
    const email = primary?.emailAddress ?? null;

    const nameParts = [user.firstName, user.lastName].filter(
      (part): part is string => Boolean(part && part.trim().length > 0),
    );
    const name =
      nameParts.length > 0
        ? nameParts.join(" ")
        : user.username && user.username.trim().length > 0
          ? user.username
          : null;

    return { email, name };
  } catch (error) {
    console.error("[email] Clerk user lookup failed:", error);
    return { email: null, name: null };
  }
}
