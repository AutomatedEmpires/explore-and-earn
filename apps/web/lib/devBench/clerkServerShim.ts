/**
 * Dev-only Clerk server shim.
 *
 * next.config aliases "@clerk/nextjs/server" to this file, but ONLY when
 * NODE_ENV !== "production" and only for the server build. It re-exports the
 * real module verbatim and overrides just `auth()` and `currentUser()`: while
 * the dev bench is impersonating a role, they return a synthetic session so
 * every server `auth()` call site sees a signed-in reviewer without a real
 * Clerk login. When the bench is off (no role cookie) they delegate to real
 * Clerk, so behaviour is identical to not having the shim. In a production
 * build the alias is never applied and this file is not bundled.
 *
 * The shim imports the real module via the `clerk-real/server` specifier, which
 * next.config aliases to the real file — this avoids the alias resolving back to
 * the shim (no circular resolution).
 */
import * as realClerk from "clerk-real/server";

import { DEV_USER_ID, devSession, isDevBenchEnabled } from "./index";
import { readDevRole } from "./server";

// Re-export the entire real surface (clerkMiddleware, createRouteMatcher,
// clerkClient, types, …). Explicit `auth`/`currentUser` below win over the
// star re-export for those two names.
export * from "clerk-real/server";

type RealAuth = typeof realClerk.auth;
type RealCurrentUser = typeof realClerk.currentUser;

const wrappedAuth = (async (...args: Parameters<RealAuth>) => {
  if (isDevBenchEnabled() && (await readDevRole())) {
    return devSession() as unknown as Awaited<ReturnType<RealAuth>>;
  }
  return realClerk.auth(...(args as Parameters<RealAuth>));
}) as RealAuth;

// Preserve any static props the real `auth` carries (e.g. `auth.protect`).
export const auth: RealAuth = Object.assign(wrappedAuth, realClerk.auth);

export const currentUser = (async (...args: Parameters<RealCurrentUser>) => {
  if (isDevBenchEnabled() && (await readDevRole())) {
    return {
      id: DEV_USER_ID,
      firstName: "Dev",
      lastName: "Bench",
      fullName: "Dev Bench",
      username: "devbench",
      imageUrl: "",
      hasImage: false,
      primaryEmailAddress: null,
      emailAddresses: [],
      publicMetadata: {},
    } as unknown as Awaited<ReturnType<RealCurrentUser>>;
  }
  return realClerk.currentUser(...(args as Parameters<RealCurrentUser>));
}) as RealCurrentUser;
