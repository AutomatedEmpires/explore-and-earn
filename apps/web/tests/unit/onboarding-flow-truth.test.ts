import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("onboarding persistence and preview truth", () => {
  it("allows the production Clerk Frontend API before CSP enforcement", () => {
    const config = source("next.config.ts");
    expect(
      config.match(/https:\/\/clerk\.exploreandearn\.com/g),
    ).toHaveLength(2);
  });

  it("keeps PostHog ingestion in connect-src and assets in script-src", () => {
    const config = source("next.config.ts");
    expect(config).toMatch(
      /connect-src[^;]*https:\/\/us\.i\.posthog\.com/,
    );
    expect(config).toMatch(
      /script-src[^;]*https:\/\/us-assets\.i\.posthog\.com/,
    );
  });

  it("ships operative legal pages without internal draft disclaimers", () => {
    const pages = [
      "app/[locale]/(legal)/terms/page.tsx",
      "app/[locale]/(legal)/cookies/page.tsx",
      "app/[locale]/(legal)/refunds/page.tsx",
    ];

    for (const path of pages) {
      const page = source(path);
      expect(page).not.toContain("DraftBanner");
      expect(page).not.toContain("not legally binding");
    }
  });

  it("persists every host essential without fabricating verification or benefits", () => {
    const page = source("app/[locale]/(host-onboard)/host/onboarding/page.tsx");

    expect(page).toContain("categoryScopes: lanes");
    expect(page).toContain("primaryLocationName: location");
    expect(page).toContain("verifiedHost: false");
    expect(page).toContain(
      'benefitProvision: { housing: "not_stated", meals: "not_stated", pay: "not_stated" }',
    );
    expect(page).not.toContain("verifiedHost: true");
  });

  it("preserves host intent when signed-out hosts enter onboarding", () => {
    const layout = source(
      "app/[locale]/(host-onboard)/layout.tsx",
    );
    const signIn = source(
      "app/[locale]/(auth)/sign-in/[[...sign-in]]/page.tsx",
    );

    expect(layout).toContain("/sign-in?role=host&redirect_url=");
    expect(signIn).toContain('authRoleHref("sign-up", role, safeRedirectUrl)');
  });

  it("preserves host intent when signed-out employers claim a sourced listing", () => {
    const claimPage = source("app/[locale]/claim/[id]/page.tsx");

    expect(claimPage).toContain("/sign-in?role=host&redirect_url=");
    expect(claimPage).toContain("encodeURIComponent(`/claim/${id}`)");
  });

  it("preserves role and exact return paths at the public-route auth boundary", () => {
    const middleware = source("middleware.ts");
    const hostLayout = source("app/[locale]/(host)/layout.tsx");
    const seekerLayout = source("app/[locale]/(seeker-onboard)/layout.tsx");

    expect(middleware).toContain("isPrivateHostDashboardPath(pathname)");
    expect(middleware).toContain('pathname.startsWith("/claim/")');
    expect(middleware).toContain("stripUnsafeAuthRedirect(request)");
    // The scrub now covers BOTH accepted parameter names (V2 D18 added the
    // spec-named `returnTo` beside Clerk's `redirect_url`); RETURN_PARAM_NAMES
    // in lib/authRedirect is the single list, so the middleware iterates it
    // rather than naming one of them here.
    expect(middleware).toContain("RETURN_PARAM_NAMES.filter");
    expect(middleware).toContain("searchParams.getAll(name)");
    expect(middleware).toContain(
      "`${request.nextUrl.pathname}${request.nextUrl.search}`",
    );
    expect(middleware).toContain('url.searchParams.set("role", funnel.role)');
    // The parameter NAME is per-funnel now (host/claim/onboarding keep
    // redirect_url; Community emits returnTo), and the value goes through the
    // shared validator before it is written.
    expect(middleware).toContain("url.searchParams.set(funnel.param, safePath)");
    expect(middleware).toContain("safeInternalRedirect(requestedPath)");
    expect(middleware).toContain("param: REDIRECT_PARAM");
    expect(hostLayout).toContain("/sign-in?role=host&redirect_url=");
    expect(seekerLayout).toContain("/sign-in?role=seeker&redirect_url=");
  });

  it("keeps the linked refund policy public", () => {
    const middleware = source("middleware.ts");
    expect(middleware).toContain('"/refunds"');
  });

  it("keeps generated metadata images public and advertises a browser icon", () => {
    const middleware = source("middleware.ts");
    const layout = source("app/layout.tsx");

    expect(middleware).toContain('"/icon"');
    expect(middleware).toContain('"/opengraph-image"');
    expect(layout).toContain('icon: [{ url: "/icon"');
  });

  it("never advances seeker onboarding after a failed save", () => {
    const paths = [
      "app/[locale]/(seeker-onboard)/onboarding/page.tsx",
      "app/[locale]/(seeker-onboard)/onboarding/prefs/page.tsx",
      "app/[locale]/(seeker-onboard)/onboarding/skills/page.tsx",
    ];

    for (const path of paths) {
      const page = source(path);
      expect(page).toContain("if (!result.ok)");
      expect(page).toContain('role="alert"');
    }

    const finalStep = source(paths[2]);
    expect(finalStep.match(/if \(!result\.ok\)/g)).toHaveLength(2);
    expect(finalStep).toContain("saveOnboardingStep({ complete: true })");
  });

  it("shows profile-edit success only after persistence succeeds", () => {
    const form = source(
      "app/[locale]/(seeker)/profile/edit/ProfileEditForm.tsx",
    );
    expect(form).toContain("if (!result.ok)");
    expect(form.indexOf("if (!result.ok)")).toBeLessThan(
      form.indexOf("setSaved(true)"),
    );
    expect(form).toContain('role="alert"');
  });
});
