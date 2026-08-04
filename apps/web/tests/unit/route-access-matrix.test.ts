import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE ROUTE-ACCESS MATRIX — who can reach what, as an executable document.
 *
 * Access in this app is decided in two places that cannot see each other:
 *
 *   1. middleware.ts — `isPublicRoute` decides whether a request without a
 *      session is allowed past Clerk at all.
 *   2. the route-group layouts — (admin) checks the founder allow-list,
 *      (host)/(seeker) resolve a profile and redirect when it is missing.
 *
 * Neither half knows what the other decided, and the interesting failures live
 * exactly in the gap. Both real incidents took the same shape: a route that
 * BUILT fine, prerendered fine and passed every test, then 404'd in production
 * for signed-out visitors because it was never added to the public matcher —
 * /swipe (linked from the footer, the homepage and /for-hosts) and
 * /for-hosts/demo. `auth.protect()` REWRITES rather than redirects, so the
 * symptom is a missing page, not an auth wall, and nobody reads it as a
 * permissions bug. A prerender proves a route compiles. It never proves
 * middleware lets a stranger reach it.
 *
 * So this file pins the decision itself. The guest column is DERIVED from the
 * live middleware source, so editing the matcher without editing this table
 * fails. The signed-in columns are DECLARED, because they are decided by layout
 * code whose redirect conditions depend on database state — that half is
 * documentation, kept honest by the structural assertions at the bottom.
 */

const WEB = join(__dirname, "../..");
const MIDDLEWARE = readFileSync(join(WEB, "middleware.ts"), "utf8");

/** Guest outcomes, named for what a visitor actually experiences. */
type GuestAccess =
  /** Renders for a visitor with no session. */
  | "public"
  /** Bounced to /sign-in with a role + return path, by protectedFunnelRole. */
  | "sign-in-redirect"
  /** auth.protect() — a REWRITE, which presents as a 404, not a login page. */
  | "auth-wall";

interface MatrixRow {
  readonly path: string;
  readonly guest: GuestAccess;
  /** What a signed-in non-host, non-admin user gets. */
  readonly seeker: "render" | "redirect" | "forbidden";
  readonly host: "render" | "redirect" | "forbidden";
  readonly admin: "render" | "redirect" | "forbidden";
  /** Why this row is what it is. */
  readonly note: string;
}

/**
 * Representative paths — one per access class, not one per route. A row earns
 * its place by being a DECISION, not by being a URL.
 */
const MATRIX: readonly MatrixRow[] = [
  // ---- Public marketing + discovery -------------------------------------
  {
    path: "/",
    guest: "public",
    seeker: "render",
    host: "render",
    admin: "render",
    note: "Homepage. The two-door hero — must render for everyone.",
  },
  {
    path: "/seek",
    guest: "public",
    seeker: "render",
    host: "render",
    admin: "render",
    note: "Public discovery. (seeker) layout renders signed-out defaults; data is live public inventory.",
  },
  {
    path: "/map",
    guest: "public",
    seeker: "render",
    host: "render",
    admin: "render",
    note: "Second discovery mode. Advertised in robots.txt + sitemap.",
  },
  {
    path: "/swipe",
    guest: "public",
    seeker: "render",
    host: "render",
    admin: "render",
    note: "Third discovery mode. WAS the 404-in-production regression — omitted from the matcher while linked from three surfaces.",
  },
  {
    path: "/jobs/farm-work",
    guest: "public",
    seeker: "render",
    host: "render",
    admin: "render",
    note: "Indexable category landing. Must be crawlable without a session.",
  },
  {
    path: "/listing/abc123",
    guest: "public",
    seeker: "render",
    host: "render",
    admin: "render",
    note: "Public listing detail — the thing every share link points at.",
  },
  {
    path: "/for-hosts",
    guest: "public",
    seeker: "render",
    host: "render",
    admin: "render",
    note: "Host acquisition page. Prospect-facing by definition.",
  },
  {
    path: "/for-hosts/demo",
    guest: "public",
    seeker: "render",
    host: "render",
    admin: "render",
    note: "Public demo workspace. The OTHER 404-in-production regression — an exact-match entry did not cover the child.",
  },
  {
    path: "/terms",
    guest: "public",
    seeker: "render",
    host: "render",
    admin: "render",
    note: "Legal. Must be readable before anyone agrees to anything.",
  },
  {
    path: "/api/notifications/unsubscribe",
    guest: "public",
    seeker: "render",
    host: "render",
    admin: "render",
    note: "Signed-token unsubscribe. The token is the credential for human GET and RFC 8058 POST requests, so Clerk must not intercept it.",
  },
  {
    path: "/blog/some-post",
    guest: "public",
    seeker: "render",
    host: "render",
    admin: "render",
    note: "Editorial marketing.",
  },
  {
    path: "/host/some-host-id",
    guest: "public",
    seeker: "render",
    host: "render",
    admin: "render",
    note: "PUBLIC host profile. Shares a prefix with the private dashboard — see the /host/listings row.",
  },
  {
    path: "/for-seekers",
    guest: "public",
    seeker: "render",
    host: "render",
    admin: "render",
    note: "D18 seeker door. One half of the two-door header — a signed-out visitor choosing 'I'm looking for work' lands here, so it cannot be behind the wall it exists to explain.",
  },
  {
    path: "/for-seekers/anything",
    guest: "public",
    seeker: "render",
    host: "render",
    admin: "render",
    note: "The seeker door needs the WILDCARD form, not an exact match. /for-hosts learned this the hard way: an exact entry left /for-hosts/demo 404ing in production while the branch build was green.",
  },

  // ---- Auth-required funnels sitting INSIDE the public matcher -----------
  {
    path: "/host/listings",
    guest: "sign-in-redirect",
    seeker: "redirect",
    host: "render",
    admin: "redirect",
    note: "PRIVATE host dashboard. Inside the broad '/host/(.*)' public entry, so isPrivateHostDashboardPath re-protects it and preserves the return path. A seeker/admin without a host profile is sent to the host funnel by the (host) layout.",
  },
  {
    path: "/claim",
    guest: "sign-in-redirect",
    seeker: "render",
    host: "render",
    admin: "render",
    note: "Claim funnel — explicitly re-protected in protectedFunnelRole with role=host.",
  },
  {
    path: "/onboarding",
    guest: "sign-in-redirect",
    seeker: "render",
    host: "render",
    admin: "render",
    note: "Seeker onboarding. In the matcher ONLY so the (seeker) layout's onboarding redirect cannot loop onto itself; re-protected with role=seeker.",
  },
  {
    path: "/community",
    guest: "sign-in-redirect",
    seeker: "render",
    host: "render",
    admin: "render",
    note: "D18 community auth gate. Community lives in the (seeker) group, whose layout renders signed-out defaults — so without an explicit gate a signed-out visitor would silently get an empty community rather than an invitation to join. Redirects to /sign-in?role=seeker with the return path preserved.",
  },
  {
    path: "/community/photos",
    guest: "sign-in-redirect",
    seeker: "render",
    host: "render",
    admin: "render",
    note: "The gate covers CHILDREN too. Photos and announcements are the two surfaces most likely to be linked directly from a notification, i.e. the ones a signed-out visitor is most likely to hit first.",
  },

  // ---- Auth wall (rewrite, not redirect) --------------------------------
  {
    path: "/saved",
    guest: "auth-wall",
    seeker: "render",
    host: "render",
    admin: "render",
    note: "Seeker-private. Not in the matcher — auth.protect() rewrites.",
  },
  {
    path: "/messages",
    guest: "auth-wall",
    seeker: "render",
    host: "render",
    admin: "render",
    note: "Seeker-private conversations.",
  },
  {
    path: "/applied",
    guest: "auth-wall",
    seeker: "render",
    host: "render",
    admin: "render",
    note: "Seeker-private application history.",
  },

  // ---- Admin ------------------------------------------------------------
  {
    path: "/admin",
    guest: "auth-wall",
    seeker: "forbidden",
    host: "forbidden",
    admin: "render",
    note: "(admin) layout redirects anyone not on the ADMIN_CLERK_USER_ID allow-list to /. Not a Clerk role claim.",
  },
  {
    path: "/admin/refunds",
    guest: "auth-wall",
    seeker: "forbidden",
    host: "forbidden",
    admin: "render",
    note: "Money queue. Same allow-list gate; the ACTIONS re-check independently (see admin-action-gate.test.ts).",
  },
  {
    path: "/listings",
    guest: "auth-wall",
    seeker: "forbidden",
    host: "forbidden",
    admin: "render",
    note: "Admin moderation table. Note the bare path — NOT under /admin — so it is only the (admin) group layout that protects it.",
  },
  {
    path: "/hosts",
    guest: "auth-wall",
    seeker: "forbidden",
    host: "forbidden",
    admin: "render",
    note: "Admin host table. Same shape: an unprefixed URL inside the (admin) group.",
  },
  {
    path: "/applications",
    guest: "auth-wall",
    seeker: "forbidden",
    host: "forbidden",
    admin: "render",
    note: "Admin review queue. Same shape.",
  },
];

/**
 * The public-matcher patterns, read out of the live middleware source.
 *
 * Parsed rather than imported because importing middleware.ts pulls in Clerk,
 * next-intl and the whole edge runtime for what is a list of strings.
 */
function publicPatterns(): string[] {
  const start = MIDDLEWARE.indexOf("const isPublicRoute = createRouteMatcher([");
  expect(start).toBeGreaterThan(-1);
  const end = MIDDLEWARE.indexOf("]);", start);
  expect(end).toBeGreaterThan(start);
  const block = MIDDLEWARE.slice(start, end);

  // Only quoted entries at the start of a line — never a path quoted inside one
  // of the long explanatory comments in this block.
  return [...block.matchAll(/^\s*"([^"]+)",/gm)].map((m) => m[1]);
}

/**
 * Clerk's createRouteMatcher compiles these with path-to-regexp. The patterns
 * in use are literals plus a `(.*)` group, so translating them directly is
 * faithful for this set — and the "every pattern is a shape we model" test
 * below fails the moment someone adds a form this does not cover.
 */
function toRegExp(pattern: string): RegExp {
  const source = pattern
    .split("(.*)")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${source}$`);
}

function isPublic(path: string): boolean {
  return publicPatterns().some((pattern) => toRegExp(pattern).test(path));
}

/**
 * Whether middleware actually consults the community gate.
 *
 * DERIVED, never assumed. If this were hardcoded to `true` the /community rows
 * would pass on a tree where the gate had been deleted — which is exactly the
 * state main was in when this test was written, after a squash merge silently
 * reverted it. A mirror of the source that cannot notice the source is gone is
 * worse than no mirror.
 */
function middlewareGatesCommunity(): boolean {
  return /isCommunityPath|communityRoutes/.test(MIDDLEWARE);
}

/** Mirrors middleware.ts's protectedFunnelRole + lib/hostRoutes. */
function isRefunnelled(path: string): boolean {
  if (path === "/claim" || path.startsWith("/claim/")) return true;
  if (path === "/onboarding" || path.startsWith("/onboarding/")) return true;
  if (
    (path === "/community" || path.startsWith("/community/")) &&
    middlewareGatesCommunity()
  ) {
    return true;
  }
  // isPrivateHostDashboardPath: /host/<segment> where the segment is a known
  // dashboard section rather than a profile id.
  return /^\/host\/(listings|applicants|messages|billing|settings|analytics|seeker|announcements|help|plans|onboarding|checkout)(\/|$)/.test(
    path,
  );
}

function derivedGuestAccess(path: string): GuestAccess {
  if (isRefunnelled(path)) return "sign-in-redirect";
  return isPublic(path) ? "public" : "auth-wall";
}

describe("route access matrix", () => {
  it("reads the public matcher (guards against a silently empty sweep)", () => {
    const patterns = publicPatterns();
    expect(patterns.length).toBeGreaterThanOrEqual(30);
    expect(patterns).toContain("/");
    expect(patterns).toContain("/seek");
  });

  it("every public pattern is a shape this test models", () => {
    // A literal, or a literal with exactly one trailing `(.*)`. Anything else
    // (a `:param`, a `?`, a nested group) would be silently mis-modelled.
    const unmodelled = publicPatterns().filter(
      (p) => !/^[A-Za-z0-9/._-]*(\(\.\*\))?$/.test(p),
    );
    expect(unmodelled).toEqual([]);
  });

  it.each(MATRIX.map((row) => [row.path, row.guest, row.note] as const))(
    "guest → %s is %s",
    (path, expected) => {
      expect(derivedGuestAccess(path)).toBe(expected);
    },
  );

  /**
   * The two doors of D18's header. /for-hosts has existed throughout;
   * /for-seekers was deleted by a squash merge and restored. Pinned together
   * because a header offering two doors with one of them 404ing is worse than
   * a header offering one.
   */
  it("both role gateways are public, with wildcard coverage", () => {
    expect(isPublic("/for-hosts")).toBe(true);
    expect(isPublic("/for-seekers")).toBe(true);
    expect(isPublic("/for-seekers/anything")).toBe(true);
  });

  /**
   * The community gate must EXIST in middleware, not merely be assumed by the
   * matrix rows above. This is the assertion that fails on a tree where the
   * gate has been reverted.
   */
  it("middleware consults the community auth gate", () => {
    expect(middlewareGatesCommunity()).toBe(true);
  });

  /**
   * The three public discovery modes are one decision, and it has been got
   * wrong once. Pinned as a group so a future edit cannot quietly drop one.
   */
  it("all three discovery modes are public", () => {
    for (const path of ["/seek", "/map", "/swipe"]) {
      expect(derivedGuestAccess(path), path).toBe("public");
    }
  });

  it("the signed-token unsubscribe endpoint is public", () => {
    expect(derivedGuestAccess("/api/notifications/unsubscribe")).toBe("public");
  });

  /**
   * /for-hosts must cover its children. An exact-match entry here is what put
   * a 404 on the public demo in production while the branch build was green.
   */
  it("the for-hosts entry covers child routes, not just the bare path", () => {
    expect(isPublic("/for-hosts")).toBe(true);
    expect(isPublic("/for-hosts/demo")).toBe(true);
  });

  /**
   * The public /host/{id} profile and the private /host/listings dashboard
   * share a URL prefix. The matcher cannot separate them, so the re-funnel does
   * — and if that ever stops working, a private dashboard becomes public.
   */
  it("the private host dashboard is re-protected inside the public /host prefix", () => {
    expect(isPublic("/host/some-host-id")).toBe(true);
    expect(isPublic("/host/listings")).toBe(true);
    expect(derivedGuestAccess("/host/some-host-id")).toBe("public");
    expect(derivedGuestAccess("/host/listings")).toBe("sign-in-redirect");
  });

  /** No admin URL may be publicly matched, under either URL shape. */
  it("no admin route is in the public matcher", () => {
    for (const path of [
      "/admin",
      "/admin/refunds",
      "/admin/claims",
      "/admin/founding",
      "/listings",
      "/hosts",
      "/applications",
    ]) {
      expect(isPublic(path), path).toBe(false);
    }
  });

  /**
   * Every row that declares "forbidden" for a signed-in non-admin must
   * actually be behind the (admin) group gate. This is the join between the
   * declared half of the table and the code.
   */
  it("every forbidden-for-seekers row is inside the allow-list-gated (admin) group", () => {
    const layout = readFileSync(
      join(WEB, "app/[locale]/(admin)/layout.tsx"),
      "utf8",
    );
    expect(layout).toContain("isAdminUserId");

    const adminRows = MATRIX.filter((r) => r.seeker === "forbidden");
    expect(adminRows.length).toBeGreaterThanOrEqual(5);
    for (const row of adminRows) {
      expect(row.admin, row.path).toBe("render");
      expect(row.host, row.path).toBe("forbidden");
      expect(row.guest, row.path).toBe("auth-wall");
    }
  });

  /**
   * Negative control. If the matcher modelling always answered "public" the
   * table above would pass while asserting nothing.
   */
  it("a route that is not in the matcher is not public (negative control)", () => {
    expect(isPublic("/definitely-not-a-route")).toBe(false);
    expect(derivedGuestAccess("/definitely-not-a-route")).toBe("auth-wall");
  });
});
