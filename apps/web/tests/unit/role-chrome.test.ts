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
const adminLayout = read("app/[locale]/(admin)/layout.tsx");
const adminHosts = read("app/[locale]/(admin)/hosts/page.tsx");

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

describe("workspace landmarks and local admin review state", () => {
  it.each(SHELLS)("gives the %s content one shared main landmark", (shell) => {
    expect(read(shell).match(/<main\b/g)).toHaveLength(1);
  });

  it("keeps the admin host queue deterministic without local Supabase", () => {
    expect(adminLayout).toContain(
      'isDevBenchEnabled() && (await readDevRole()) === "admin"',
    );
    expect(adminHosts).toContain("const isDevReview =");
    expect(adminHosts).toContain("rows: DEV_HOSTS_BY_PAGE[page] ?? []");
    expect(adminHosts).toContain("totalPages: 2");
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

describe("role-true public chrome", () => {
  const shell = read("components/public/PublicShell.tsx");
  const chrome = read("components/public/PublicChrome.tsx");
  const header = read("components/global/GlobalHeader.tsx");
  const bottomNav = read("components/public/PublicBottomNav.tsx");
  const footerCss = read("components/SiteFooter.module.css");
  const messages = JSON.parse(read("messages/en.json")) as {
    Nav: Record<string, string>;
  };

  it("keeps the public Server Component static and delegates auth to its controller", () => {
    expect(shell).toContain("<PublicChrome");
    expect(shell).toContain("clerkConfigured={Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)}");
    expect(shell).not.toContain("useAuth");
    expect(shell).not.toContain("cookies(");
  });

  it("invokes Clerk only inside the configured child and begins with guest markup", () => {
    expect(chrome).toContain("function ClerkPublicChrome");
    expect(chrome).toContain("const { isLoaded, isSignedIn, userId } = useAuth()");
    expect(chrome).toContain("if (clerkConfigured)");
    expect(chrome).toContain("<ClerkPublicChrome>{children}</ClerkPublicChrome>");
    expect(chrome).toContain('<ChromeFrame role="guest" state="guest">');
  });

  it("uses a seeker fallback while a guarded no-store role request resolves", () => {
    expect(chrome).toContain('fetch("/api/viewer/navigation"');
    expect(chrome).toContain('cache: "no-store"');
    expect(chrome).toContain("new AbortController()");
    expect(chrome).toContain(
      "isCurrentViewerRequest(activeUserId.current, requestUserId)",
    );
    expect(chrome).toContain("isViewerNavigationResponse(payload)");
    expect(chrome).toContain("deriveClerkViewerSnapshot");
  });

  it("reads the local role cookie only behind the compile-time dev-bench gate", () => {
    const gate = chrome.indexOf("if (devBenchEnabled)");
    const mount = chrome.indexOf("<DevBenchPublicChrome>", gate);
    expect(gate).toBeGreaterThan(-1);
    expect(mount).toBeGreaterThan(gate);
    expect(chrome).toContain("document.cookie");
    expect(chrome).toContain("DEV_ROLE_COOKIE");
  });

  it("exposes stable role state and mounts the four-tab dock only for guest and seeker", () => {
    expect(chrome).toContain("data-public-viewer-role={role}");
    expect(chrome).toContain("data-public-viewer-state={state}");
    expect(chrome).toContain('role === "guest" || role === "seeker"');
    expect(bottomNav).toContain("data-public-bottom-nav");
  });

  it("routes each authenticated role to its own home, profile, and notifications", () => {
    expect(header).toContain("PUBLIC_ROLE_DESTINATIONS[viewerRole]");
    expect(header).toContain("const homeHref = destinations.home");
    expect(header).toContain("const profileHref = destinations.profile");
    expect(header).toContain("const notificationsHref = destinations.notifications");
    expect(header).toContain('viewerRole === "seeker"');
    expect(header).toContain('t("workspace")');
    expect(header).toContain('t("exploreJobs")');
    expect(messages.Nav.workspace).toBe("Workspace");
    expect(messages.Nav.exploreJobs).toBe("Explore jobs");
  });

  it("keeps the header available to host and admin viewers on immersive seeker routes", () => {
    expect(header).toContain(
      '(viewerRole === "guest" || viewerRole === "seeker") &&',
    );
    expect(header).toContain("IMMERSIVE_ROUTES.some(");
  });

  it("reserves footer dock clearance only while the dock is mounted", () => {
    expect(footerCss).toContain(":global(body:has([data-public-bottom-nav])) .footer");
    expect(footerCss).toContain("@media (max-width: 1023px)");
  });
});
