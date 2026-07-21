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
