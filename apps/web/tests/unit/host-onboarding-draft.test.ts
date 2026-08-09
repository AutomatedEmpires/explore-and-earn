/**
 * The onboarding draft's decisions, tested as decisions.
 *
 * Everything the wizard shows a host about their own half-built profile comes
 * out of hostOnboardingDraft.ts, and the rule it enforces is narrow enough to be
 * stated in one line: NEVER SHOW A HOST A VALUE THEY DID NOT ENTER. Not a
 * placeholder, not a default, not the absence marker their seekers would see.
 * Blanks are named as guidance instead.
 *
 * These assertions exist because the failure mode is silent and flattering. A
 * preview that fills a gap with a plausible stand-in looks BETTER than one that
 * does not — right up to the moment the host publishes and finds out the
 * sentence was never theirs. The source-scan in onboarding-flow-truth pins that
 * no placeholder string is written down; this pins that the logic which decides
 * what to render agrees.
 */
import { describe, expect, it } from "vitest";

import {
  EMPTY_ONBOARDING_DRAFT,
  ONBOARDING_STEPS,
  canLeaveIdentityStep,
  hostOnboardingDraftReady,
  hostOnboardingIdentityKey,
  payCents,
  profileGaps,
  restoreHostOnboardingDraft,
  roleCardReady,
  stepIndexOf,
  toPreviewHostProfile,
  toPreviewListing,
  type HostOnboardingDraft,
} from "../../components/onboarding/hostOnboardingDraft";

function draft(overrides: Partial<HostOnboardingDraft> = {}): HostOnboardingDraft {
  return { ...EMPTY_ONBOARDING_DRAFT, ...overrides };
}

const COMPLETE = draft({
  companyName: "Sunrise Valley Collective",
  lanes: ["farm"],
  primaryLocationName: "Wenatchee, Washington",
  websiteUrl: "https://sunrisevalley.example",
  logoUrl: "https://project.supabase.co/storage/v1/object/public/listing-media/a/b.webp",
  tagline: "A harvest season with cabins and crew meals",
  about: "Six weeks of tree fruit, a bunkhouse, and dinner cooked for everyone.",
  housingOffered: true,
  mealsOffered: true,
  roleTitle: "Orchard Crew",
  roleCategory: "farm",
  rolePayMin: "21",
  rolePayPeriod: "hour",
});

describe("account-scoped draft readiness", () => {
  it("never renders account A's restored draft after Clerk switches to account B", () => {
    expect(hostOnboardingDraftReady(true, "user-a", "user-a")).toBe(true);
    expect(hostOnboardingDraftReady(true, "user-b", "user-a")).toBe(false);
    expect(hostOnboardingDraftReady(true, "user-b", "user-b")).toBe(true);
  });

  it("stays behind the loading boundary before auth or restore completes", () => {
    expect(hostOnboardingDraftReady(false, undefined, null)).toBe(false);
    expect(hostOnboardingDraftReady(true, "user-a", null)).toBe(false);
  });

  it("remounts the wizard when account identity changes during pending work", () => {
    const accountAKey = hostOnboardingIdentityKey("user-a");
    const accountBKey = hostOnboardingIdentityKey("user-b");

    expect(accountBKey).not.toBe(accountAKey);
    expect(hostOnboardingIdentityKey(null)).toBe("signed-out");
  });
});

describe("browser draft restoration", () => {
  it("restores a valid partial draft through explicit known fields", () => {
    expect(
      restoreHostOnboardingDraft({
        companyName: "North Star Lodge",
        lanes: ["seasonal", "seasonal"],
        housingOffered: true,
        rolePayPeriod: "week",
        ignoredFutureField: "never spread into state",
      }),
    ).toEqual({
      ...EMPTY_ONBOARDING_DRAFT,
      companyName: "North Star Lodge",
      lanes: ["seasonal"],
      housingOffered: true,
      rolePayPeriod: "week",
    });
  });

  it.each([
    { lanes: {} },
    { lanes: ["farm", "unknown"] },
    { housingOffered: "true" },
    { logoUrl: { href: "https://example.com/logo.webp" } },
    { roleCategory: "unknown" },
    { rolePayPeriod: "fortnight" },
  ])("fails closed when a known field has an invalid shape: %o", (stored) => {
    expect(restoreHostOnboardingDraft(stored)).toEqual(EMPTY_ONBOARDING_DRAFT);
  });

  it("fails closed for non-object storage values", () => {
    expect(restoreHostOnboardingDraft(null)).toEqual(EMPTY_ONBOARDING_DRAFT);
    expect(restoreHostOnboardingDraft([])).toEqual(EMPTY_ONBOARDING_DRAFT);
    expect(restoreHostOnboardingDraft("draft")).toEqual(EMPTY_ONBOARDING_DRAFT);
  });
});

// ── Steps ──────────────────────────────────────────────────────────────────

describe("the step sequence", () => {
  it("starts on the showcase and ends on a saved role", () => {
    expect(ONBOARDING_STEPS[0]).toBe("welcome");
    expect(ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1]).toBe("role");
    expect(stepIndexOf("preview")).toBeGreaterThan(stepIndexOf("story"));
  });

  /**
   * The identity step is the only gate, and it gates on exactly what
   * create_my_host_profile requires: a name and at least one lane. Anything
   * stricter would block a host on a field the server does not want; anything
   * looser sends them into a refusal they cannot read.
   */
  it("gates the identity step on what profile creation actually requires", () => {
    expect(canLeaveIdentityStep(EMPTY_ONBOARDING_DRAFT)).toBe(false);
    expect(canLeaveIdentityStep(draft({ companyName: "Only a name" }))).toBe(false);
    expect(canLeaveIdentityStep(draft({ lanes: ["farm"] }))).toBe(false);
    expect(
      canLeaveIdentityStep(draft({ companyName: "Both", lanes: ["farm"] })),
    ).toBe(true);
  });

  it("does not accept whitespace as a company name", () => {
    expect(canLeaveIdentityStep(draft({ companyName: "   ", lanes: ["farm"] }))).toBe(
      false,
    );
  });
});

// ── Gaps ───────────────────────────────────────────────────────────────────

describe("what is still missing", () => {
  it("names every blank on an empty draft, and none on a complete one", () => {
    const ids = profileGaps(EMPTY_ONBOARDING_DRAFT).map((gap) => gap.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "location",
        "logo",
        "website",
        "tagline",
        "about",
        "benefits",
        "role",
      ]),
    );
    expect(profileGaps(COMPLETE)).toHaveLength(0);
  });

  it("clears a gap the moment its field is filled, and not before", () => {
    expect(profileGaps(draft({ tagline: "   " })).map((g) => g.id)).toContain(
      "tagline",
    );
    expect(profileGaps(draft({ tagline: "A real line" })).map((g) => g.id)).not.toContain(
      "tagline",
    );
  });

  /**
   * A DELIBERATE "NO" IS NOT A GAP. A host who provides neither housing nor
   * meals has answered; the guidance says so and then stops asking. Treating an
   * honest no as an unfinished field would nag a host into claiming a benefit
   * they do not offer, which is the exact pressure the honesty rules exist to
   * remove.
   */
  it("treats either benefit as an answer, and says so rather than nagging", () => {
    expect(profileGaps(draft({ housingOffered: true })).map((g) => g.id)).not.toContain(
      "benefits",
    );
    expect(profileGaps(draft({ mealsOffered: true })).map((g) => g.id)).not.toContain(
      "benefits",
    );

    const benefitGap = profileGaps(EMPTY_ONBOARDING_DRAFT).find(
      (gap) => gap.id === "benefits",
    );
    expect(benefitGap?.body).toContain("leave both off");
  });

  /** Every gap is an instruction with a reason, never a bare "required". */
  it("says what filling each gap actually does", () => {
    for (const gap of profileGaps(EMPTY_ONBOARDING_DRAFT)) {
      expect(gap.label.length).toBeGreaterThan(0);
      expect(gap.body.length).toBeGreaterThan(20);
      expect(gap.body).not.toMatch(/required/i);
    }
  });
});

// ── The preview models ─────────────────────────────────────────────────────

describe("the profile handed to the real seeker-facing components", () => {
  /**
   * A blank must arrive as null, because null is what HostProfileHero omits.
   * An empty string is a value, and a value renders — an empty tagline element
   * under the company name is a layout hole the host cannot explain.
   */
  it("passes blanks through as null rather than as empty values", () => {
    const host = toPreviewHostProfile(EMPTY_ONBOARDING_DRAFT, "preview");
    expect(host.tagline).toBeNull();
    expect(host.about).toBeNull();
    expect(host.primaryLocationName).toBeNull();
    expect(host.websiteUrl).toBeNull();
    expect(host.photoUrl).toBeNull();
  });

  it("trims whitespace-only input to absence, not to whitespace", () => {
    const host = toPreviewHostProfile(draft({ tagline: "   \n  " }), "preview");
    expect(host.tagline).toBeNull();
  });

  /**
   * VERIFIED IS FALSE AND STAYS FALSE. The badge is derived from an active paid
   * subscription; a preview that showed it would be selling one to a host who
   * has not bought anything.
   */
  it("never shows the verified badge in a preview", () => {
    expect(toPreviewHostProfile(COMPLETE, "preview").verified).toBe(false);
  });

  it("carries the host's real lanes through to the category chips", () => {
    const host = toPreviewHostProfile(
      draft({ lanes: ["farm", "seasonal"] }),
      "preview",
    );
    expect(host.categoryScopes).toEqual(["farm", "seasonal"]);
  });

  /** The one invented string, and it is a label rather than a claim. */
  it("uses a neutral stand-in only for a name that has not been typed yet", () => {
    expect(toPreviewHostProfile(EMPTY_ONBOARDING_DRAFT, "preview").companyName).toBe(
      "Your organization",
    );
    expect(toPreviewHostProfile(COMPLETE, "preview").companyName).toBe(
      "Sunrise Valley Collective",
    );
  });
});

describe("the role card gate", () => {
  /**
   * THE WHOLE POINT OF THE GATE. The public listing card derives pay through
   * formatCompensation, whose fallback is the absence marker — so rendering a
   * card for a role with no pay figure would print that marker across the host's
   * own preview. Below the bar there is no card at all, and the wizard says what
   * the card needs instead.
   */
  it("refuses to render a card that would carry an absent benefit", () => {
    expect(roleCardReady(EMPTY_ONBOARDING_DRAFT)).toBe(false);
    expect(toPreviewListing(EMPTY_ONBOARDING_DRAFT)).toBeNull();

    const titleOnly = draft({ roleTitle: "Orchard Crew", roleCategory: "farm" });
    expect(roleCardReady(titleOnly)).toBe(false);
    expect(toPreviewListing(titleOnly)).toBeNull();
  });

  it("renders once a single pay bound exists — a floor or a ceiling", () => {
    const floor = draft({
      roleTitle: "Orchard Crew",
      roleCategory: "farm",
      rolePayMin: "21",
    });
    const ceiling = draft({
      roleTitle: "Orchard Crew",
      roleCategory: "farm",
      rolePayMax: "25",
    });
    expect(roleCardReady(floor)).toBe(true);
    expect(roleCardReady(ceiling)).toBe(true);
  });

  it("still refuses when a lane has not been chosen", () => {
    expect(
      roleCardReady(draft({ roleTitle: "Orchard Crew", rolePayMin: "21" })),
    ).toBe(false);
  });

  it("carries the host's own housing and meals answers, never a default", () => {
    const listing = toPreviewListing(
      draft({ ...COMPLETE, roleHousingIncluded: true, roleMealsIncluded: false }),
    );
    expect(listing?.housingIncluded).toBe(true);
    expect(listing?.mealsIncluded).toBe(false);
  });

  it("converts pay to integer cents, which is what the column stores", () => {
    const listing = toPreviewListing(
      draft({ ...COMPLETE, rolePayMin: "21.5", rolePayMax: "25" }),
    );
    expect(listing?.compensationMinCents).toBe(2150);
    expect(listing?.compensationMaxCents).toBe(2500);
  });
});

describe("parsing a typed pay figure", () => {
  it("reads a blank, a negative and a non-number all as absence", () => {
    expect(payCents("")).toBeNull();
    expect(payCents("   ")).toBeNull();
    expect(payCents("-5")).toBeNull();
    expect(payCents("twenty one")).toBeNull();
    expect(payCents("Infinity")).toBeNull();
  });

  it("rounds to whole cents rather than storing a fraction of one", () => {
    expect(payCents("21")).toBe(2100);
    expect(payCents("21.005")).toBe(2101);
    expect(payCents("0")).toBe(0);
  });
});
