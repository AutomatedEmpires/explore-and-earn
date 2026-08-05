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
 * so the bench can never ship. Local review also requires an explicit
 * `NEXT_PUBLIC_DEV_BENCH=1` opt-in; an unset flag fails closed.
 *
 * NODE_ENV and NEXT_PUBLIC_DEV_BENCH are inlined by Next at build time, so this
 * evaluates correctly on both the server and the client.
 */
export function isDevBenchEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_DEV_BENCH === "1"
  );
}

/**
 * Is NEXT_PUBLIC_SUPABASE_URL pointed at a demonstrably NON-production Supabase?
 *
 * Fail-closed: only explicitly-local hosts pass. Any hosted project (including a
 * hosted *.supabase.co dev project), a missing URL, or an unparseable URL is
 * treated as potentially-production and returns false. This is the axis that a
 * stray `next dev` against prod env cannot satisfy — prod's NEXT_PUBLIC_SUPABASE_URL
 * is a hosted host, not localhost.
 */
function isNonProdSupabaseUrl(): boolean {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return false;
  let host: string;
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    return false;
  }
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host === "host.docker.internal" ||
    host === "kong" || // Supabase CLI local stack service name
    host.endsWith(".localhost") ||
    host.endsWith(".local")
  );
}

/**
 * SECOND, INDEPENDENT dev-bench gate (belt-and-suspenders on top of
 * `isDevBenchEnabled`). Governs the bench's PRIVILEGED grants — the middleware
 * auth bypass, the admin allow-list grant, and the real service-role token
 * handed to the impersonated session.
 *
 * Requires ALL of:
 *   1. isDevBenchEnabled()            — NODE_ENV gate plus explicit local opt-in.
 *   2. NEXT_PUBLIC_DEV_BENCH === "1"  — repeated here as defense in depth.
 *   3. isNonProdSupabaseUrl()         — the data target is a local, non-prod DB.
 *
 * So a stray `next dev` against production env — which has a hosted Supabase URL
 * and would not have NEXT_PUBLIC_DEV_BENCH=1 set — can never hand out admin or
 * the service-role key, even though NODE_ENV happens to be non-production.
 */
export function isDevBenchPrivileged(): boolean {
  return (
    isDevBenchEnabled() &&
    process.env.NEXT_PUBLIC_DEV_BENCH === "1" &&
    isNonProdSupabaseUrl()
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
    // in a prod build. The key is handed out ONLY behind the hardened
    // `isDevBenchPrivileged()` gate (explicit opt-in + non-prod Supabase URL),
    // so a stray `next dev` against prod env gets the inert sentinel, never the
    // real service-role key. Also falls back to the sentinel when the key is unset.
    getToken: async () =>
      (isDevBenchPrivileged() ? process.env.SUPABASE_SERVICE_ROLE_KEY : undefined) ??
      DEV_TOKEN,
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
    benefitLibraryAvailable: true,
    benefitLibrary: {},
    narrative: {
      whyWorkForUs:
        "A small crew with clear training, shared meals, and evenings free to explore the valley.",
      team: [{ name: "Maya", role: "Orchard manager" }],
      activities: ["River days", "Trail access", "Community markets"],
      perks: ["Shared staff housing", "Shift meals", "End-of-season bonus"],
      culture: [
        "Clear expectations",
        "Safety before speed",
        "Respectful feedback",
      ],
      managementApproach:
        "The crew starts with a short daily plan, receives schedules a week ahead, and handles feedback in private one-on-ones.",
      typicalDay:
        "Morning crews gather for assignments, rotate through orchard rows with a lead nearby, and finish with a shared equipment handoff.",
      workEnvironment:
        "Most work is outdoors on uneven ground in changing temperatures. Training, water breaks, and the pace are adjusted for conditions.",
      seasonRhythm: [
        "August — arrival and paid orientation",
        "September — peak harvest",
        "October — final pick and close-down",
      ],
      training: [
        "Paid safety orientation",
        "Role shadowing before independent work",
        "End-of-season skills recap",
      ],
      transportation: [
        "Daily shuttle between staff housing and the orchard",
        "Weekly grocery run into Wenatchee",
      ],
      remoteness:
        "Staff housing is on the orchard. Groceries and healthcare are available in Wenatchee, about fifteen minutes away.",
      nearbyServices: ["Grocery store", "Urgent care", "Pharmacy", "Bus station"],
      housingDescription:
        "Shared on-site staff housing includes utilities, a kitchen, laundry access, and a short walk to the morning meeting point.",
      mealsDescription:
        "A hot crew meal is provided on working days, with a shared kitchen available for breakfast and days off.",
      faqs: [
        {
          question: "How are days off scheduled?",
          answer:
            "Schedules are posted a week ahead, and the team aims to keep days off together whenever harvest conditions allow.",
        },
        {
          question: "Do I need a car?",
          answer:
            "No. The daily work shuttle and weekly grocery run cover essentials, though a car gives you more flexibility on days off.",
        },
      ],
    },
  };
}

/** Display name shown in the seeker header while impersonating. */
export function devSeekerName(): string {
  return "Avery (dev)";
}
