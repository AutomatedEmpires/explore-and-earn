import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * D17 role-scoped chrome: the role pill, and where the theme switcher is
 * allowed to live.
 *
 * TWO INVARIANTS, both easy to break by accident:
 *
 * 1. NO PILL SIGNED OUT. A visitor who has not signed in has no role, so a pill
 *    reading "Seeker" over a marketing page asserts a state they never entered.
 *    The public header must therefore gate on authentication — and the gate has
 *    to be threaded from the header, because RolePill defaults to authenticated
 *    (the workspace shells are all behind auth already).
 *
 * 2. ONE HOME FOR APPEARANCE. The theme switcher left the public header in V1
 *    (D2) and now leaves the workspace top bars too. Every top bar that carries
 *    it is one more place a preference competes with the work; seeker Settings
 *    → Appearance is the single home. This test fails if any shell re-adds it.
 */

const webRoot = new URL("../../", import.meta.url);
const read = (relative: string) => readFileSync(new URL(relative, webRoot), "utf8");

const SHELLS = [
  "components/host/HostShell.tsx",
  "components/admin/AdminShell.tsx",
  "components/seeker/SeekerShell.tsx",
] as const;

describe("the role pill", () => {
  const pill = read("components/global/RolePill.tsx");
  const pillCss = read("components/global/RolePill.module.css");

  it("offers exactly the three chrome roles", () => {
    expect(pill).toContain('export type ChromeRole = "seeker" | "host" | "admin"');
    for (const label of ["Seeker", "Host", "Admin"]) {
      expect(pill).toContain(`"${label}"`);
    }
  });

  it("renders nothing when the viewer is not authenticated", () => {
    expect(pill).toMatch(/if\s*\(!isAuthenticated\)\s*\{\s*\n\s*return null;/);
  });

  /**
   * NEVER COLOR-ONLY (WCAG 1.4.1). The role must be legible without perceiving
   * the hue, so the visible text label is unconditional — there is no icon-only
   * or swatch-only branch.
   */
  it("always renders a text label, so colour is never the only signal", () => {
    expect(pill).toContain("{label}");
    expect(pill).toContain("const label = LABELS[role]");
  });

  it("labels itself for assistive tech in words, not just the bare noun", () => {
    expect(pill).toContain("aria-label={`Signed in as ${label}`}");
  });

  it("colours each role from a semantic token, never a raw value", () => {
    expect(pillCss).toContain('[data-role="seeker"] { --rolepill-accent: var(--color-cta); }');
    expect(pillCss).toContain('[data-role="host"]   { --rolepill-accent: var(--color-alpine); }');
    expect(pillCss).toContain('[data-role="admin"]  { --rolepill-accent: var(--text-primary); }');
    expect(pillCss).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("is rendered on every authenticated shell", () => {
    for (const shell of SHELLS) {
      expect(read(shell), `${shell} does not render <RolePill`).toContain("<RolePill");
    }
  });

  it("is gated on authentication in the PUBLIC header", () => {
    const header = read("components/global/GlobalHeader.tsx");
    expect(header).toContain("<RolePill role={chromeRole} tone=\"onDark\" isAuthenticated={isAuthenticated} />");
    // The old scope badge is gone — it rendered signed-out, and it labelled a
    // PLACE (Community) rather than a role. Its whole mechanism went with it:
    // the `scopeLabel` string the badge derived from no longer exists, so the
    // badge cannot be resurrected by re-adding one <span>.
    expect(header).not.toContain("scopeBadge");
    expect(header).not.toContain("scopeLabel");
    expect(header).toContain("const chromeRole: ChromeRole | null =");
  });

  it("left no orphaned scope-badge styling behind in the header", () => {
    expect(read("components/global/GlobalHeader.module.css")).not.toContain(".scopeBadge {");
  });
});

describe("the theme switcher", () => {
  it.each(SHELLS)("is absent from the %s top bar", (shell) => {
    const source = read(shell);
    expect(source).not.toContain("<ThemeSwitcher");
    expect(source).not.toContain('from "../global/ThemeSwitcher"');
  });

  it("is absent from the public header", () => {
    expect(read("components/global/GlobalHeader.tsx")).not.toContain("ThemeSwitcher");
  });

  /**
   * Removing it everywhere would be a regression, not a simplification — the
   * Light/Dark/System contract still has to be reachable. Appearance in seeker
   * Settings is where it lives now, so assert it is STILL there.
   */
  it("survives in seeker Settings → Appearance", () => {
    expect(read("components/seeker/AppearanceControl.tsx")).toContain("ThemeSwitcher");
  });
});
