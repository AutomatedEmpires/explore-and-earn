/**
 * Dev Mock Bench — core gate + constants (isomorphic).
 *
 * REVIEW TOOLING ONLY. Lets a local reviewer browse every surface as
 * seeker / host / admin with mock data, without juggling Clerk logins. It is
 * structurally impossible to enable in production (see `isDevBenchEnabled`):
 * production and Vercel preview both build with NODE_ENV=production, and the
 * Clerk-server alias that powers impersonation is only wired in next.config when
 * NODE_ENV !== "production", so the shim is not even bundled in a prod build.
 *
 * This module must stay dependency-light (no next/* imports): it is pulled into
 * the import graph of the Clerk-server shim, which is aliased in front of every
 * server module. Request-scoped cookie reads live in `./server`.
 */

import type { HostProfile } from "@explore-and-earn/db";

export type DevRole = "seeker" | "host" | "admin";

export const DEV_ROLES: readonly DevRole[] = ["seeker", "host", "admin"];

/** Cookie that carries the currently-impersonated role. */
export const DEV_ROLE_COOKIE = "ee_dev_role";

/** Synthetic Clerk user id handed to the app while impersonating. */
export const DEV_USER_ID = "user_devbench_local";

/** Sentinel token returned by the synthetic session's getToken(). */
export const DEV_TOKEN = "devbench-local-token";

export function isDevRole(value: unknown): value is DevRole {
  return value === "seeker" || value === "host" || value === "admin";
}

/**
 * The single switch everything keys off. False in production no matter what,
 * so the bench can never ship. A `NEXT_PUBLIC_DEV_BENCH=0` kill-switch lets a
 * developer force it off locally; otherwise it is on under `next dev`.
 *
 * NODE_ENV and NEXT_PUBLIC_DEV_BENCH are inlined by Next at build time, so this
 * evaluates correctly on both the server and the client.
 */
export function isDevBenchEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_DEV_BENCH !== "0"
  );
}

/**
 * Minimal Clerk-`auth()`-shaped object for the impersonated reviewer. Only the
 * fields the app actually reads (`userId`, `getToken`) are meaningful; the rest
 * of the real Auth surface is filled in by a cast at the shim boundary.
 */
export function devSession() {
  return {
    userId: DEV_USER_ID,
    sessionId: "sess_devbench_local",
    sessionClaims: {},
    orgId: null,
    orgRole: null,
    // Real Supabase service-role key so the authed db client bypasses RLS and
    // returns the impersonated demo user's ACTUAL seeded data (queries still
    // filter explicitly by clerk_user_id). Review tooling only — never bundled
    // in a prod build. Falls back to the inert sentinel if the key is unset.
    getToken: async () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? DEV_TOKEN,
  };
}

/** Synthetic host profile so the (host) lane renders without a real row. */
export function devHostProfile(): HostProfile {
  return {
    id: "host_devbench_local",
    companyName: "Wenatchee Orchard Co. (dev)",
    hostName: "Maya",
    tagline: "Dev bench preview — family orchard hiring seasonal crews.",
    about:
      "Synthetic host profile shown only in the local dev mock bench. Replace by signing in as a real host.",
    primaryLocationName: "Wenatchee, WA",
    photoUrl: null,
    websiteUrl: null,
    socialLinks: { instagram: null, twitter: null },
    categoryScopes: ["farm", "seasonal"],
    housingOfferedGenerally: true,
    mealsOfferedGenerally: true,
    subscriptionTier: "professional",
  };
}

/** Display name shown in the seeker header while impersonating. */
export function devSeekerName(): string {
  return "Avery (dev)";
}
