import {
  MARKETPLACE_CATEGORIES,
  SEEKER_BENEFIT_PREFERENCES,
  SEEKER_REMOTE_PREFERENCES,
  SEEKER_SEEKING_TIMELINES,
  type MarketplaceCategory,
  type SeekerBenefitPreference,
  type SeekerRemotePreference,
  type SeekerSeekingTimeline as CanonicalSeekerSeekingTimeline,
} from "@explore-and-earn/contracts";
import type {
  ResumeMissingSection,
  SeekerProfileRecord,
  SeekerResumeStatus,
} from "@explore-and-earn/db";

export type SeekerSeekingTimeline = CanonicalSeekerSeekingTimeline;

/**
 * The small, serializable profile slice shared by the onboarding steps.
 *
 * Every field already exists on seeker_profiles. This is intentionally not a
 * second persistence model: the provider only keeps navigation state warm,
 * while each Continue action writes its owned fields to Supabase.
 */
export interface SeekerOnboardingDraft {
  readonly displayName: string;
  readonly bio: string;
  readonly relativeLocation: string;
  readonly seekingTimeline: SeekerSeekingTimeline | null;
  readonly remotePreference: SeekerRemotePreference | null;
  readonly housingPref: SeekerBenefitPreference | null;
  readonly mealsPref: SeekerBenefitPreference | null;
  readonly categories: MarketplaceCategory[];
  readonly desiredRoles: string[];
  readonly generalSkills: string[];
}

export const EMPTY_SEEKER_ONBOARDING_DRAFT: SeekerOnboardingDraft = {
  displayName: "",
  bio: "",
  relativeLocation: "",
  seekingTimeline: null,
  remotePreference: null,
  housingPref: null,
  mealsPref: null,
  categories: [],
  desiredRoles: [],
  generalSkills: [],
};

const TIMELINES = new Set<SeekerSeekingTimeline>(SEEKER_SEEKING_TIMELINES);
const REMOTE_PREFERENCES = new Set<SeekerRemotePreference>(
  SEEKER_REMOTE_PREFERENCES,
);
const BENEFIT_PREFERENCES = new Set<SeekerBenefitPreference>(
  SEEKER_BENEFIT_PREFERENCES,
);
const CATEGORIES = new Set<MarketplaceCategory>(MARKETPLACE_CATEGORIES);

function member<T extends string>(value: string | null, values: Set<T>): T | null {
  return value !== null && values.has(value as T) ? (value as T) : null;
}

/** Convert the real persisted record into the client-safe wizard draft. */
export function seekerProfileToOnboardingDraft(
  profile: SeekerProfileRecord | null,
): SeekerOnboardingDraft {
  if (!profile) return EMPTY_SEEKER_ONBOARDING_DRAFT;

  return {
    displayName: profile.displayName ?? "",
    bio: profile.shortBio ?? "",
    relativeLocation: profile.relativeLocation ?? "",
    seekingTimeline: member(profile.seekingTimeline, TIMELINES),
    remotePreference: member(profile.remotePreference, REMOTE_PREFERENCES),
    housingPref: member(profile.housingPreference, BENEFIT_PREFERENCES),
    mealsPref: member(profile.mealsPreference, BENEFIT_PREFERENCES),
    categories: profile.desiredCategories.filter((value) =>
      CATEGORIES.has(value as MarketplaceCategory),
    ) as MarketplaceCategory[],
    desiredRoles: profile.desiredRoles.slice(),
    generalSkills: profile.generalSkills.slice(),
  };
}

export const SEEKING_TIMELINE_OPTIONS: readonly {
  readonly value: SeekerSeekingTimeline;
  readonly label: string;
}[] = [
  { value: "now", label: "Ready now" },
  { value: "1_month", label: "Within 1 month" },
  { value: "3_months", label: "Within 3 months" },
  { value: "6_months", label: "Within 6 months" },
];

export const RESUME_MISSING_LABELS: Record<ResumeMissingSection, string> = {
  displayName: "your name",
  location: "where you are based",
  seekingTimeline: "when you can start",
  skills: "at least one skill",
  bioOrExperience: "a short bio or work experience",
};

export interface SeekerOnboardingOutcome {
  readonly readyToApply: boolean;
  readonly completion: number;
  readonly missingLabels: string[];
}

/** Keep completion copy tied to the same status object the apply gate uses. */
export function onboardingOutcome(
  status: SeekerResumeStatus,
): SeekerOnboardingOutcome {
  return {
    readyToApply: status.complete,
    completion: status.completion,
    missingLabels: status.missing.map((section) => RESUME_MISSING_LABELS[section]),
  };
}
