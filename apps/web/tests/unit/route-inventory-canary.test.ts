import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SIBLING-DELETION CANARY — load-bearing routes still exist.
 *
 * This is the cheapest test in the repo and it exists because of the most
 * expensive class of failure we have hit.
 *
 * WHAT HAPPENED: PR #299 was squash-merged, and its tree silently reverted an
 * earlier phase's work. /for-seekers, the community auth gate, the nav menu and
 * the phase's own two test files all vanished from main in one commit. CI was
 * green throughout — because the deleted files INCLUDED THEIR OWN TESTS. A
 * suite cannot fail for a spec it no longer contains. Typecheck passed too:
 * nothing that survived imported what was removed, so there was no dangling
 * reference to catch. The only signal was a human noticing a missing page.
 *
 * That is the general shape: when a merge deletes a feature wholesale, every
 * mechanism we rely on deletes its own alarm along with it. The only test that
 * survives such a merge is one that lives SOMEWHERE ELSE and names the files by
 * path. This file is that. It imports nothing and renders nothing; it asserts
 * that a list of paths is still on disk.
 *
 * RULES FOR THIS LIST
 *   - A path earns a place by being load-bearing: a route a link points at, a
 *     gate that decides access, a surface a customer pays to reach. Not every
 *     file — a list nobody trusts gets deleted itself.
 *   - When a route is DELIBERATELY removed, delete its line here in the same
 *     commit. The diff then says "we meant this", which is exactly the sentence
 *     the squash merge could not produce.
 */

const WEB = join(__dirname, "../..");

/**
 * PHASE C (public information architecture, D18). Every entry here was present,
 * then absent, then restored. They are listed first because they are the proven
 * case, not a hypothetical one.
 */
const PHASE_C: readonly string[] = [
  "app/[locale]/for-seekers/page.tsx",
  "app/[locale]/for-seekers/layout.tsx",
  "lib/communityRoutes.ts",
  // The gate is co-located with the route it guards, not in components/.
  "app/[locale]/(seeker)/community/layout.tsx",
  "app/[locale]/(seeker)/community/CommunityJoinGate.tsx",
  "app/[locale]/(seeker)/community/access.ts",
  "components/global/NavMenu.tsx",
  "tests/unit/community-auth-gate.test.ts",
  "tests/unit/public-ia.test.ts",
];

/** Public surfaces linked from the header, footer, sitemap or robots.txt. */
const PUBLIC_SURFACES: readonly string[] = [
  "app/[locale]/page.tsx",
  "app/[locale]/(seeker)/seek/page.tsx",
  "app/[locale]/(seeker)/map/page.tsx",
  "app/[locale]/(seeker)/swipe/page.tsx",
  "app/[locale]/for-hosts/page.tsx",
  "app/[locale]/for-hosts/demo/page.tsx",
  "app/[locale]/jobs/page.tsx",
  "app/[locale]/(legal)/terms/page.tsx",
  "app/[locale]/(legal)/privacy/page.tsx",
  "app/[locale]/(legal)/refunds/page.tsx",
  "app/[locale]/(legal)/credits/page.tsx",
  "app/[locale]/(legal)/sourced-listings/page.tsx",
];

/** The paid funnel. If one of these goes missing, revenue stops. */
const PAID_FUNNEL: readonly string[] = [
  "app/[locale]/(host-onboard)/host/plans/page.tsx",
  "app/[locale]/(host-onboard)/host/plans/activate/page.tsx",
  "app/[locale]/(host-onboard)/host/checkout/complete/page.tsx",
  "app/[locale]/(host)/host/billing/page.tsx",
];

/** The host workspace a paying host is buying access to. */
const HOST_WORKSPACE: readonly string[] = [
  "app/[locale]/(host)/host/page.tsx",
  "app/[locale]/(host)/host/listings/page.tsx",
  "app/[locale]/(host)/host/applicants/page.tsx",
  "app/[locale]/(host)/host/messages/page.tsx",
  "app/[locale]/(host)/host/outreach/page.tsx",
  "app/[locale]/(host)/host/coach/page.tsx",
  "app/[locale]/(host)/host/analytics/page.tsx",
  "app/[locale]/(host)/host/announcements/page.tsx",
];

/** Admin operations. No queue here may quietly disappear. */
const ADMIN_SURFACES: readonly string[] = [
  "app/[locale]/(admin)/layout.tsx",
  "app/[locale]/(admin)/admin/page.tsx",
  "app/[locale]/(admin)/admin/refunds/page.tsx",
  "app/[locale]/(admin)/admin/claims/page.tsx",
  "app/[locale]/(admin)/admin/reports/page.tsx",
  "app/[locale]/(admin)/admin/deletions/page.tsx",
  "app/[locale]/(admin)/admin/founding/page.tsx",
  "app/[locale]/(admin)/admin/notifications/page.tsx",
  "app/[locale]/(admin)/admin/sourcing/page.tsx",
  "app/[locale]/(admin)/listings/page.tsx",
  "app/[locale]/(admin)/hosts/page.tsx",
  "app/[locale]/(admin)/applications/page.tsx",
  "components/admin/ConfirmAction.tsx",
];

/** Files that decide who may reach what. Losing one silently opens a door. */
const ACCESS_CONTROL: readonly string[] = [
  "middleware.ts",
  "lib/admin.ts",
  "lib/hostRoutes.ts",
  "app/[locale]/(host)/layout.tsx",
  "app/[locale]/(seeker)/layout.tsx",
];

const GROUPS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["phase C public IA", PHASE_C],
  ["public surfaces", PUBLIC_SURFACES],
  ["paid funnel", PAID_FUNNEL],
  ["host workspace", HOST_WORKSPACE],
  ["admin surfaces", ADMIN_SURFACES],
  ["access control", ACCESS_CONTROL],
];

describe("route inventory canary", () => {
  it("the canary list is non-trivial (guards against a silently empty sweep)", () => {
    const total = GROUPS.reduce((sum, [, paths]) => sum + paths.length, 0);
    expect(total).toBeGreaterThanOrEqual(45);
  });

  it.each(GROUPS.flatMap(([group, paths]) => paths.map((p) => [group, p] as const)))(
    "%s — %s still exists",
    (_group, path) => {
      expect(existsSync(join(WEB, path)), `${path} is missing`).toBe(true);
    },
  );

  /**
   * Negative control: existsSync must actually be able to say no, or every
   * assertion above passes for a directory that has been emptied.
   */
  it("reports a deleted file as deleted (negative control)", () => {
    expect(existsSync(join(WEB, "app/[locale]/definitely-not-a-route/page.tsx"))).toBe(
      false,
    );
  });
});
