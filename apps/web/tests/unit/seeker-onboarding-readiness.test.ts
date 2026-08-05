import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  seekerResumeCompletion,
  type SeekerProfileRecord,
  type SeekerResume,
} from "@explore-and-earn/db";

import {
  onboardingOutcome,
  seekerProfileToOnboardingDraft,
} from "../../components/onboarding/seekerOnboardingModel";

function resume(
  profile: SeekerResume["profile"],
): SeekerResume {
  return {
    profile,
    experiences: [],
    educations: [],
    certifications: [],
  };
}

describe("seeker onboarding readiness", () => {
  it("prefills every wizard step from the persisted seeker profile", () => {
    const profile: SeekerProfileRecord = {
      id: "seeker-1",
      displayName: "River",
      shortBio: "Seasonal cook",
      openToStatement: null,
      locationPref: "Pacific Northwest",
      remotePreference: "on_site",
      housingPreference: "required",
      mealsPreference: "flexible",
      payExpectationMinCents: null,
      payExpectationMaxCents: null,
      payExpectationUnit: null,
      payFlexible: false,
      desiredCategories: ["farm", "not-a-category"],
      desiredRoles: ["Ranch hand"],
      generalSkills: ["Cooking"],
      onboardingComplete: false,
      profilePhotoUrl: null,
      heroCoverUrl: null,
      seekingTimeline: "1_month",
      relativeLocation: "Bend, Oregon",
    };

    expect(seekerProfileToOnboardingDraft(profile)).toEqual({
      displayName: "River",
      bio: "Seasonal cook",
      relativeLocation: "Bend, Oregon",
      seekingTimeline: "1_month",
      remotePreference: "on_site",
      housingPref: "required",
      mealsPref: "flexible",
      categories: ["farm"],
      desiredRoles: ["Ranch hand"],
      generalSkills: ["Cooking"],
    });
  });

  it("uses the canonical apply gate and names every missing requirement", () => {
    const outcome = onboardingOutcome(
      seekerResumeCompletion(
        resume({
          seekerProfileId: "seeker-1",
          displayName: "River",
          bio: null,
          headline: null,
          location: null,
          seekingTimeline: null,
          desiredCategories: ["farm"],
          generalSkills: [],
        }),
      ),
    );

    expect(outcome).toEqual({
      readyToApply: false,
      completion: 20,
      missingLabels: [
        "where you are based",
        "when you can start",
        "at least one skill",
        "a short bio or work experience",
      ],
    });
  });

  it("only claims readiness when every apply requirement is present", () => {
    const outcome = onboardingOutcome(
      seekerResumeCompletion(
        resume({
          seekerProfileId: "seeker-1",
          displayName: "River",
          bio: "Seasonal cook and trail guide.",
          headline: null,
          location: "Bend, Oregon",
          seekingTimeline: "1_month",
          desiredCategories: ["seasonal"],
          generalSkills: ["Cooking"],
        }),
      ),
    );

    expect(outcome).toEqual({
      readyToApply: true,
      completion: 100,
      missingLabels: [],
    });
  });
});
