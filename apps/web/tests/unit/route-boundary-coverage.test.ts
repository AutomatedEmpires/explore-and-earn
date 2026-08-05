import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every route group that owns a shell owns its own loading and error states
 * (design contract D23).
 *
 * Next.js will happily fall back to the nearest ancestor boundary, so a group
 * with no loading.tsx is not broken — it is WRONG-SHAPED, which is harder to
 * notice and worse to look at. The [locale]-level fallback is a discovery-grid
 * skeleton, so before this test the legal pages flashed a lattice of listing
 * cards before resolving into a terms document, and the paid host-onboarding
 * funnel did the same thing between plan steps. Nobody files that as a bug;
 * they just see a page that feels cheap at the moment it is asking for money.
 *
 * The rule is scoped to groups that have their OWN layout.tsx. A group with a
 * distinct shell has a distinct content shape, so the ancestor's skeleton is
 * guaranteed to be wrong for it; a group without one is already rendering in
 * its parent's chrome and the parent's boundary fits.
 */

const LOCALE_ROOT = join(__dirname, "../../app/[locale]");

/**
 * Groups deliberately outside the rule, each for a reason that would otherwise
 * have to be rediscovered.
 */
const EXEMPT: Readonly<Record<string, string>> = {
  // Holds shared auth components (role tabs, Clerk appearance, keyless notice)
  // and no route segments of its own — there is nothing to put a boundary on.
  "(auth)": "no route segments — component holder only",
  // The impersonation bench. Never present in a production build, and it is the
  // tool you use when things are already broken; a skeleton would be noise.
  "(dev)": "dev-only tooling, not in production builds",
};

function routeGroups(): string[] {
  return readdirSync(LOCALE_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("("))
    .map((entry) => entry.name)
    .sort();
}

/** Groups that own a shell, and therefore owe their own boundaries. */
function shellGroups(): string[] {
  return routeGroups().filter(
    (group) =>
      !(group in EXEMPT) && existsSync(join(LOCALE_ROOT, group, "layout.tsx")),
  );
}

/**
 * True when the group has its own boundary, or one at the single route subtree
 * it contains. (host) puts its loading.tsx at (host)/host/loading.tsx, which
 * covers every route the group actually has — the group root is not a route.
 */
function hasBoundary(group: string, file: string): boolean {
  const root = join(LOCALE_ROOT, group);
  if (existsSync(join(root, file))) return true;

  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .some((entry) => existsSync(join(root, entry.name, file)));
}

describe("route boundary coverage (D23)", () => {
  it("finds route groups to scan (guards against a silently empty sweep)", () => {
    expect(routeGroups().length).toBeGreaterThanOrEqual(6);
    expect(shellGroups().length).toBeGreaterThanOrEqual(5);
  });

  it("every exemption names a group that still exists", () => {
    const groups = routeGroups();
    for (const name of Object.keys(EXEMPT)) {
      expect(groups, `${name} is exempted but no longer exists`).toContain(name);
    }
  });

  it.each(shellGroups())("%s has an error boundary", (group) => {
    expect(hasBoundary(group, "error.tsx")).toBe(true);
  });

  it("keeps the listing-specific not-found page locale-aware", () => {
    const notFound = readFileSync(
      join(LOCALE_ROOT, "listing/[id]/not-found.tsx"),
      "utf8",
    );

    expect(notFound).toContain('getTranslations("ListingNotFound")');
    expect(notFound).toContain('from "../../../../i18n/navigation"');
    expect(notFound).not.toContain('from "next/link"');
  });

  it.each(shellGroups())("%s has a loading state", (group) => {
    expect(hasBoundary(group, "loading.tsx")).toBe(true);
  });

  /**
   * The root boundaries are the last line of defence — an error thrown in the
   * root layout itself cannot be caught by any segment boundary.
   */
  it("the app root has a global error boundary and a not-found", () => {
    const appRoot = join(__dirname, "../../app");
    expect(existsSync(join(appRoot, "global-error.tsx"))).toBe(true);
    expect(existsSync(join(appRoot, "not-found.tsx"))).toBe(true);
    expect(existsSync(join(LOCALE_ROOT, "error.tsx"))).toBe(true);
    expect(existsSync(join(LOCALE_ROOT, "loading.tsx"))).toBe(true);
    expect(existsSync(join(LOCALE_ROOT, "not-found.tsx"))).toBe(true);
  });

  /**
   * Negative control: the detector must be capable of saying no, or every
   * assertion above is vacuous.
   */
  it("reports a missing boundary as missing (negative control)", () => {
    expect(hasBoundary("(admin)", "definitely-not-a-boundary.tsx")).toBe(false);
  });
});
