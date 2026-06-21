import { auth } from "@clerk/nextjs/server";

import { DEV_USER_ID, isDevBenchEnabled } from "./devBench";

/**
 * Founder allow-list for the admin panel.
 *
 * Authorization is an explicit Clerk user-id allow-list supplied via env
 * (ADMIN_CLERK_USER_ID) — NOT a Clerk role/claim — so a leaked or
 * misconfigured role can never escalate into the admin surface. filter(Boolean)
 * drops the empty fallback, so an UNSET env var yields an EMPTY allow-list
 * (deny everyone) rather than matching the empty string.
 */
export const ADMIN_USER_IDS: string[] = [
  process.env.ADMIN_CLERK_USER_ID ?? "",
].filter(Boolean);

/** True only when `userId` is a configured founder/admin id. */
export function isAdminUserId(userId: string | null | undefined): boolean {
  // DEV MOCK BENCH (review tooling only): the synthetic bench user id only ever
  // appears when the Clerk shim is already impersonating, so granting it admin
  // here lets the (admin) lane be reviewed locally. False in production/preview.
  if (isDevBenchEnabled() && userId === DEV_USER_ID) {
    return true;
  }
  return typeof userId === "string" && ADMIN_USER_IDS.includes(userId);
}

/**
 * Server-side check for the currently authenticated Clerk user. Used by the
 * admin server actions to re-verify the caller independently of the page gate
 * (server actions are separately invocable endpoints).
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const { userId } = await auth();
  return isAdminUserId(userId);
}
