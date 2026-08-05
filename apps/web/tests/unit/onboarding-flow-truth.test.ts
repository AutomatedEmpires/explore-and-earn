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

    expect(page).toContain("categoryScopes: draft.lanes");
    expect(page).toContain("primaryLocationName: location");
    expect(page).toContain("verifiedHost: false");
    expect(page).not.toContain("verifiedHost: true");
  });

  /**
   * THE PREVIEW NEVER PRINTS THE ABSENCE MARKER OVER THE HOST'S OWN BLANKS.
   *
   * The V1 flow rendered its card unconditionally with `not_stated` evidence on
   * all three benefits and placeholder triad copy ("You choose", "You set the
   * rate"), so a host's first sight of their own listing was three cells saying
   * nothing. Absence rendering as the not-stated label is RIGHT on a live
   * listing — a seeker must be able to tell silence from a no — and wrong here,
   * where the silence is the host's own and the useful form of it is an
   * instruction.
   *
   * So the card is gated on the triad being fillable from real input, and what
   * is missing is named as guidance instead. Both halves are pinned: the gate,
   * and the absence of a fabricated stand-in.
   */
  it("never shows the host an absence marker or a placeholder value for their own data", () => {
    const page = source("app/[locale]/(host-onboard)/host/onboarding/page.tsx");
    const model = source("components/onboarding/hostOnboardingDraft.ts");
    const preview = source("components/onboarding/HostSeekerPreview.tsx");

    // The card renders only when the triad can be filled from what was typed.
    expect(page).toContain("roleCardReady(draft)");
    expect(preview).toContain("toPreviewListing");
    expect(model).toContain("if (!roleCardReady(draft)) return null");

    // No stand-in values, and no absence marker, anywhere the host's own data
    // is rendered.
    //
    // COMMENTS ARE STRIPPED FIRST. Both files explain in prose what the rejected
    // version rendered, and naming the old placeholder is how that explanation
    // survives the next reader — a negative assertion that cannot tell a
    // rendered string from a description of one is testing the description.
    const code = (text: string) =>
      text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

    for (const placeholder of [
      "Not stated",
      "not_stated",
      "You choose",
      "You set the rate",
      "Dates you choose",
    ]) {
      expect(code(page), `wizard must not render "${placeholder}"`).not.toContain(
        placeholder,
      );
      expect(
        code(model),
        `draft model must not invent "${placeholder}"`,
      ).not.toContain(placeholder);
    }
  });

  /**
   * THE DEMO PREVIEW IS COMPLETE, and that is the point of showing it.
   *
   * The welcome step's job is to answer "what am I building" before asking for
   * eight minutes of someone's afternoon. It does that with the Enterprise
   * fixtures rendered through production components — and the flagship role
   * carries a real housing type, a real meals line and a real pay range, so no
   * cell on it can read as an absence. Sourcing any of it from a literal here
   * would let the showcase drift from the demo it claims to be a window onto.
   */
  it("builds the welcome showcase from the demo fixtures, with no absent benefit", () => {
    const showcase = source("components/onboarding/DemoEmployerPreview.tsx");

    expect(showcase).toContain("DEMO_FLAGSHIP_ROLE");
    expect(showcase).toContain("DemoOrgIdentity");
    expect(showcase).toContain("DemoRoleCard");
    expect(showcase).toContain("DemoMetricTiles");
    // Money through the formatter chokepoint, never hand-built.
    expect(showcase).toContain("formatCompensation");
    // Labelled as sample data on every block.
    expect(showcase).toContain("DEMO_DATA_LABEL");

    expect(showcase).not.toContain("Not stated");
    expect(showcase).not.toMatch(/\$\s?\d/);
  });

  /**
   * PAYMENT IS NOT REQUIRED TO BEGIN, said on the first screen (D6/D7).
   *
   * Migration 086 removed the paid-tier refusal from profile creation, so this
   * is now simply true — and a host who does not know it is a host who bounces
   * off an onboarding screen believing they are on a checkout funnel.
   */
  it("says on the welcome step that payment is not required to begin", () => {
    const page = source("app/[locale]/(host-onboard)/host/onboarding/page.tsx");

    expect(page).toContain("Payment is not required to begin");
    expect(page).toContain("<DemoEmployerPreview");
    // The tour is referenced, not rebuilt here (D19/D20).
    expect(page).toContain('href="/for-hosts/demo"');
    expect(page).toContain("See the full product tour");
  });

  /**
   * EVERY STEP EVENT FIRES ONCE, whatever the host does afterwards.
   *
   * A step can be revisited — going Back and forward again is normal — and a
   * host who edits their company name three times has still completed the
   * identity step once. Without the guard a completion rate counts revisits, and
   * the funnel reports more completions than hosts.
   */
  it("reports each onboarding step at most once", () => {
    const page = source("app/[locale]/(host-onboard)/host/onboarding/page.tsx");
    const events = source("lib/analytics/events.ts");
    const preview = () => source("components/onboarding/HostSeekerPreview.tsx");

    for (const name of [
      "host_onboarding_started",
      "host_company_identity_completed",
      "host_logo_uploaded",
      "host_cover_uploaded",
      "host_story_completed",
      "host_benefits_completed",
      "host_seeker_preview_opened",
    ]) {
      expect(events, `events must declare ${name}`).toContain(`"${name}"`);
    }

    expect(page).toContain("reportedSteps");
    expect(page).toContain("if (reportedSteps.current.has(event)) return false");
    // The seeker-preview event is reported from the STEP TRANSITION, not from
    // the preview component. The wizard renders that component in three
    // positions, so React remounts it on every step change — a once-per-mount
    // guard inside it would reset each time and over-count a host who stepped
    // back. Pinned here because the tempting fix is to move it back.
    expect(preview()).not.toContain("captureFunnelEvent");
    for (const guarded of [
      "onboardingStarted",
      "companyIdentityCompleted",
      "storyCompleted",
      "seekerPreviewOpened",
    ]) {
      expect(page, `${guarded} must be behind the once-guard`).toContain(
        `reportOnce(HOST_FUNNEL_EVENTS.${guarded})`,
      );
    }
  });

  /**
   * THE LOGO GOES SOMEWHERE. The picker the product already shipped says in its
   * own header that it persists nothing — an upload set a local preview URL and
   * vanished on navigation. An onboarding step cannot ask for a logo through a
   * control like that, so the upload posts a server action that writes the
   * column the public profile actually renders.
   */
  it("persists an uploaded logo instead of previewing it", () => {
    const page = source("app/[locale]/(host-onboard)/host/onboarding/page.tsx");
    const action = source("app/actions/hostProfile.ts");

    expect(page).toContain("uploadHostLogoAction");
    expect(action).toContain("export async function uploadHostLogoAction");
    // Normalized, guarded and bound — the same chain the housing upload uses.
    expect(action).toContain("prepareUploadImage");
    expect(action).toContain("guardTrustedUploadSlot");
    expect(action).toContain("hasTrustedUploadBudget");
    expect(action).toContain("photoUrl: uploadedUrl");
  });

  /**
   * AUTOSAVE AND RESUME. Two layers, because they answer different questions: a
   * local copy so a closed tab is survivable, and a row so "saved" means saved.
   * The local read happens after mount behind a flag — the pattern DemoSession
   * established — because a store read during render makes the first client
   * paint disagree with the server's.
   */
  it("restores an interrupted draft without breaking hydration", () => {
    const page = source("app/[locale]/(host-onboard)/host/onboarding/page.tsx");

    expect(page).toContain("ONBOARDING_DRAFT_KEY");
    expect(page).toContain("window.localStorage.getItem(ONBOARDING_DRAFT_KEY)");
    expect(page).toContain("setRestored(true)");
    expect(page).toContain("if (!restored) return");
    // Save-and-leave persists to the server before it navigates.
    expect(page).toContain("handleSaveAndLeave");
    expect(page).toContain("await persistProfile()");
    // And returns somewhere internal, through the shared sanitizer rather than a
    // second copy of the rule.
    expect(page).toContain("safeInternalRedirect");
    expect(page).toContain('searchParams.get("redirect_url")');
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
    expect(finalStep.match(/if \(!result\.ok\)/g)).toHaveLength(1);
  });

  it("separates profile-step persistence from explicit onboarding completion", () => {
    const action = source("app/actions/seekerOnboarding.ts");
    const finalStep = source(
      "app/[locale]/(seeker-onboard)/onboarding/skills/page.tsx",
    );
    const donePage = source(
      "app/[locale]/(seeker-onboard)/onboarding/done/page.tsx",
    );
    const finishControl = source(
      "components/onboarding/SeekerOnboardingFinish.tsx",
    );

    expect(finalStep).not.toContain("complete: true");
    expect(finalStep).toContain('stepHref("/onboarding/done", returnTo)');
    expect(finalStep.match(/onClick={goNext}/g)).toHaveLength(2);
    expect(action).toContain("export async function finishSeekerOnboarding");
    expect(action.match(/onboardingComplete: true/g)).toHaveLength(1);
    expect(donePage).toContain("seekerResumeCompletion");
    expect(donePage).toContain("Still needed to apply");
    expect(finishControl).toContain("finishSeekerOnboarding()");
  });

  it("never replaces a persisted seeker profile with a blank draft after a read fault", () => {
    const layout = source("app/[locale]/(seeker-onboard)/layout.tsx");
    const profileQuery = source("../../packages/db/src/queries/seekerProfiles.ts");

    expect(layout).toContain("getSeekerProfileResult");
    expect(layout).toContain("if (!result.ok) return <ProfileLoadError />");
    expect(layout).toContain("seekerProfileToOnboardingDraft(result.profile)");
    expect(profileQuery).toContain("export type SeekerProfileLoadResult");
    expect(profileQuery).toContain("ok: true, profile: null");
    expect(profileQuery).toContain("ok: false, error:");
  });

  it("keeps the seeded seeker wizard behind the non-production dev-bench gate", () => {
    const layout = source("app/[locale]/(seeker-onboard)/layout.tsx");
    const action = source("app/actions/seekerOnboarding.ts");
    const done = source(
      "app/[locale]/(seeker-onboard)/onboarding/done/page.tsx",
    );

    expect(layout).toContain("isDevBenchEnabled()");
    expect(layout).toContain('(await readDevRole()) === "seeker"');
    expect(layout).toContain("DEV_BENCH_DRAFT");
    expect(action).toContain("isSeekerDevBenchSession");
    expect(action).toContain("isDevBenchEnabled()");
    expect(action).toContain('(await readDevRole()) === "seeker"');
    expect(done).toContain("DEV_BENCH_RESUME_STATUS");
    expect(done).toContain("isDevBenchEnabled()");
    expect(done).toContain('(await readDevRole()) === "seeker"');
  });

  it("keeps work setting separate from the free-text travel region", () => {
    const action = source("app/actions/seekerOnboarding.ts");
    const prefs = source(
      "app/[locale]/(seeker-onboard)/onboarding/prefs/page.tsx",
    );
    const profileQuery = source("../../packages/db/src/queries/seekerProfiles.ts");

    expect(action).toContain("remotePreference");
    expect(action).not.toContain("locationPref");
    expect(prefs).toContain("remotePreference");
    expect(profileQuery).toContain("patch.remote_preference");
    expect(profileQuery).toContain("patch.location_pref");
  });

  it("gives repeated skill controls distinct accessible names and hides decorative progress bars", () => {
    const steps = [
      source("app/[locale]/(seeker-onboard)/onboarding/page.tsx"),
      source("app/[locale]/(seeker-onboard)/onboarding/prefs/page.tsx"),
      source("app/[locale]/(seeker-onboard)/onboarding/skills/page.tsx"),
      source("app/[locale]/(seeker-onboard)/onboarding/done/page.tsx"),
    ];
    const skills = steps[2];
    const profile = source(
      "app/[locale]/(seeker)/profile/edit/ProfileEditForm.tsx",
    );

    expect(skills).toContain("aria-describedby={hintId}");
    expect(skills).toContain("aria-label={`New ${label.toLowerCase()}`}");
    expect(skills).toContain("aria-label={`Add ${label.toLowerCase()}`}");
    for (const step of steps) expect(step).toContain('aria-hidden="true"');
    expect(profile).toContain('aria-label="Role to add"');
    expect(profile).toContain('aria-label="Add role"');
    expect(profile).toContain('aria-label="Skill to add"');
    expect(profile).toContain('aria-label="Add skill"');
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

  it("fails profile editing closed on read faults and preserves every pay unit", () => {
    const page = source("app/[locale]/(seeker)/profile/edit/page.tsx");
    const form = source(
      "app/[locale]/(seeker)/profile/edit/ProfileEditForm.tsx",
    );

    expect(page).toContain("getSeekerProfileResult");
    expect(page).toContain("if (!loaded.ok) return { ok: false }");
    expect(page).toContain("result.ok ?");
    expect(form).toContain('{ value: "year", label: "/ year" }');
    expect(form).toContain('{ value: "other", label: "other" }');
    expect(form).toContain("desiredRoles: rolesToSave");
    expect(form).toContain("generalSkills: skillsToSave");
    expect(form).toContain("disabled={pending} aria-busy={pending}");
  });
});
