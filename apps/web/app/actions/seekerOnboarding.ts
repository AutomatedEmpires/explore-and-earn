"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import {
  MARKETPLACE_CATEGORIES,
  SEEKER_BENEFIT_PREFERENCES,
  SEEKER_REMOTE_PREFERENCES,
  SEEKER_SEEKING_TIMELINES,
  type MarketplaceCategory,
  type SeekerBenefitPreference,
  type SeekerRemotePreference,
  type SeekerSeekingTimeline,
} from "@explore-and-earn/contracts";
import {
  saveSeekerProfile,
  type SeekerProfileUpdate,
} from "@explore-and-earn/db";

import { queueSeekerMatchRecompute } from "../../lib/matchRecompute";
import { isDevBenchEnabled } from "../../lib/devBench";
import { readDevRole } from "../../lib/devBench/server";
import { reportError } from "../../lib/sentry";

/**
 * Seeker onboarding write path (Wave 9 / Agent B).
 *
 * IDENTITY: clerkUserId ALWAYS comes from auth().userId — never decoded from the
 * native Supabase-integrated token. Every step is optional/skippable. The
 * generic step writer cannot complete onboarding; finishSeekerOnboarding is the
 * only action allowed to release the seeker-shell gate.
 */
export type OnboardingStepData = {
  displayName?: string | null;
  bio?: string | null;
  relativeLocation?: string | null;
  seekingTimeline?: SeekerSeekingTimeline | null;
  openToStatement?: string | null;
  remotePreference?: SeekerRemotePreference | null;
  housingPref?: SeekerBenefitPreference | null;
  mealsPref?: SeekerBenefitPreference | null;
  payExpectationMinCents?: number | null;
  payExpectationMaxCents?: number | null;
  payExpectationUnit?: "hour" | "day" | "week" | "month" | "year" | "stipend" | "exchange" | "other";
  payFlexible?: boolean;
  categories?: string[];
  desiredRoles?: string[];
  generalSkills?: string[];
};

const MAX_FREEFORM_TAGS = 10;
const MAX_TAG_LENGTH = 40;
const MAX_DISPLAY_NAME_LENGTH = 80;
const MAX_BIO_LENGTH = 1_000;
const MAX_LOCATION_LENGTH = 160;
const MAX_OPEN_TO_LENGTH = 500;
const SEEKING_TIMELINES = new Set<string>(SEEKER_SEEKING_TIMELINES);
const REMOTE_PREFERENCES = new Set<string>(SEEKER_REMOTE_PREFERENCES);
const BENEFIT_PREFS = new Set<string>(SEEKER_BENEFIT_PREFERENCES);
const PAY_UNITS = new Set([
  "hour",
  "day",
  "week",
  "month",
  "year",
  "stipend",
  "exchange",
  "other",
]);

/**
 * Step fields the ADR-040 engine actually scores — a step that only touches
 * display fields (name, bio, open-to statement) doesn't need a rescore.
 */
const MATCH_INPUT_STEP_KEYS: readonly (keyof OnboardingStepData)[] = [
  "remotePreference",
  "housingPref",
  "mealsPref",
  "payExpectationMinCents",
  "payExpectationMaxCents",
  "payFlexible",
  "categories",
  "desiredRoles",
  "generalSkills",
];

async function currentUserId(): Promise<string | undefined> {
  try {
    return (await auth()).userId ?? undefined;
  } catch {
    return undefined;
  }
}

async function isSeekerDevBenchSession(): Promise<boolean> {
  return isDevBenchEnabled() && (await readDevRole()) === "seeker";
}

async function saveOnboardingStepImpl(
  stepData: OnboardingStepData,
): Promise<{ ok: boolean; error?: string }> {
  const validationError = validateStepData(stepData);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  // Review tooling only: keep the local wizard navigable with the seeded draft
  // while never pretending to persist against a sentinel token. This branch is
  // structurally unavailable in preview/production via isDevBenchEnabled().
  if (await isSeekerDevBenchSession()) return { ok: true };

  const { userId, getToken } = await auth();
  if (!userId) {
    return { ok: false, error: "not_authenticated" };
  }
  const token = await getToken();
  if (!token) {
    return { ok: false, error: "no_token" };
  }

  // SeekerProfileUpdate fields are readonly, so build via conditional spreads.
  const update: SeekerProfileUpdate = {
    ...(stepData.displayName !== undefined
      ? { displayName: normalizeText(stepData.displayName) }
      : undefined),
    ...(stepData.bio !== undefined
      ? { bio: normalizeText(stepData.bio) }
      : undefined),
    ...(stepData.relativeLocation !== undefined
      ? { relativeLocation: normalizeText(stepData.relativeLocation) }
      : undefined),
    ...(stepData.seekingTimeline !== undefined
      ? { seekingTimeline: stepData.seekingTimeline }
      : undefined),
    ...(stepData.remotePreference !== undefined
      ? { remotePreference: stepData.remotePreference }
      : undefined),
    ...(stepData.housingPref !== undefined
      ? { housingPref: stepData.housingPref }
      : undefined),
    ...(stepData.mealsPref !== undefined
      ? { mealsPref: stepData.mealsPref }
      : undefined),
    ...(stepData.openToStatement !== undefined
      ? { openToStatement: normalizeText(stepData.openToStatement) }
      : undefined),
    ...(stepData.payExpectationMinCents !== undefined
      ? { payExpectationMinCents: stepData.payExpectationMinCents }
      : undefined),
    ...(stepData.payExpectationMaxCents !== undefined
      ? { payExpectationMaxCents: stepData.payExpectationMaxCents }
      : undefined),
    ...(stepData.payExpectationUnit !== undefined
      ? { payExpectationUnit: stepData.payExpectationUnit }
      : undefined),
    ...(stepData.payFlexible !== undefined
      ? { payFlexible: stepData.payFlexible }
      : undefined),
    ...(stepData.categories !== undefined
      ? { categories: sanitizeCategories(stepData.categories) }
      : undefined),
    ...(stepData.desiredRoles !== undefined
      ? { desiredRoles: sanitizeFreeform(stepData.desiredRoles) }
      : undefined),
    ...(stepData.generalSkills !== undefined
      ? { generalSkills: sanitizeFreeform(stepData.generalSkills) }
      : undefined),
  };

  const result = await saveSeekerProfile(token, userId, update);

  // Stored ADR-040 scores go stale the moment the engine's inputs change —
  // rescore fire-and-forget after the response (bounded + best-effort inside
  // queueSeekerMatchRecompute) so the seeker's pills reflect the new profile.
  if (
    result.ok &&
    MATCH_INPUT_STEP_KEYS.some((key) => stepData[key] !== undefined)
  ) {
    try {
      queueSeekerMatchRecompute(userId);
    } catch (error) {
      // Persistence is already durable. A queue-registration fault must not
      // make the UI retry an update that successfully reached Postgres.
      reportError(error, {
        action: "saveOnboardingStep.postPersistRecompute",
        userId,
      });
    }
  }

  return result;
}

export async function saveOnboardingStep(
  stepData: OnboardingStepData,
): Promise<{ ok: boolean; error?: string }> {
  try {
    return await saveOnboardingStepImpl(stepData);
  } catch (error) {
    reportError(error, {
      action: "saveOnboardingStep",
      userId: await currentUserId(),
    });
    throw error;
  }
}

/**
 * The one completion boundary for seeker onboarding.
 *
 * `onboarding_complete` means the seeker has finished or explicitly deferred
 * this introduction. It does NOT mean their résumé is ready to apply; the done
 * page derives that independent truth from seekerResumeCompletion.
 */
export async function finishSeekerOnboarding(): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    if (await isSeekerDevBenchSession()) return { ok: true };

    const { userId, getToken } = await auth();
    if (!userId) return { ok: false, error: "not_authenticated" };
    const token = await getToken();
    if (!token) return { ok: false, error: "no_token" };

    const result = await saveSeekerProfile(token, userId, {
      onboardingComplete: true,
    });
    if (result.ok) {
      try {
        revalidatePath("/onboarding");
        revalidatePath("/seek");
        revalidatePath("/profile");
        revalidatePath("/resume");
      } catch (error) {
        // Cache freshness is downstream of the durable completion flag.
        reportError(error, {
          action: "finishSeekerOnboarding.postPersistRevalidate",
          userId,
        });
      }
    }
    return result;
  } catch (error) {
    reportError(error, {
      action: "finishSeekerOnboarding",
      userId: await currentUserId(),
    });
    throw error;
  }
}

function normalizeText(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function invalidNullableEnum(
  value: string | null | undefined,
  allowed: ReadonlySet<string>,
): boolean {
  return value !== undefined && value !== null && !allowed.has(value);
}

function invalidCents(value: number | null | undefined): boolean {
  return (
    value !== undefined &&
    value !== null &&
    (!Number.isSafeInteger(value) || value < 0)
  );
}

function invalidNullableText(value: unknown): boolean {
  return value !== undefined && value !== null && typeof value !== "string";
}

function invalidTagList(value: unknown): boolean {
  return (
    !Array.isArray(value) ||
    value.length > MAX_FREEFORM_TAGS ||
    value.some(
      (item) =>
        typeof item !== "string" || item.trim().length > MAX_TAG_LENGTH,
    )
  );
}

function validateStepData(stepData: OnboardingStepData): string | null {
  if (
    invalidNullableText(stepData.displayName) ||
    invalidNullableText(stepData.bio) ||
    invalidNullableText(stepData.relativeLocation) ||
    invalidNullableText(stepData.openToStatement)
  ) {
    return "invalid_text_field";
  }
  if (
    (stepData.categories !== undefined &&
      invalidTagList(stepData.categories)) ||
    (stepData.desiredRoles !== undefined &&
      invalidTagList(stepData.desiredRoles)) ||
    (stepData.generalSkills !== undefined &&
      invalidTagList(stepData.generalSkills))
  ) {
    return "invalid_tag_list";
  }
  if (
    stepData.payFlexible !== undefined &&
    typeof stepData.payFlexible !== "boolean"
  ) {
    return "invalid_pay_flexible";
  }

  const displayName =
    stepData.displayName === undefined ? null : normalizeText(stepData.displayName);
  const bio = stepData.bio === undefined ? null : normalizeText(stepData.bio);
  const relativeLocation =
    stepData.relativeLocation === undefined
      ? null
      : normalizeText(stepData.relativeLocation);
  const openTo =
    stepData.openToStatement === undefined
      ? null
      : normalizeText(stepData.openToStatement);

  if (displayName && displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    return "display_name_too_long";
  }
  if (bio && bio.length > MAX_BIO_LENGTH) return "bio_too_long";
  if (relativeLocation && relativeLocation.length > MAX_LOCATION_LENGTH) {
    return "location_too_long";
  }
  if (openTo && openTo.length > MAX_OPEN_TO_LENGTH) {
    return "open_to_statement_too_long";
  }
  if (invalidNullableEnum(stepData.seekingTimeline, SEEKING_TIMELINES)) {
    return "invalid_seeking_timeline";
  }
  if (invalidNullableEnum(stepData.remotePreference, REMOTE_PREFERENCES)) {
    return "invalid_remote_preference";
  }
  if (invalidNullableEnum(stepData.housingPref, BENEFIT_PREFS)) {
    return "invalid_housing_preference";
  }
  if (invalidNullableEnum(stepData.mealsPref, BENEFIT_PREFS)) {
    return "invalid_meals_preference";
  }
  if (invalidNullableEnum(stepData.payExpectationUnit, PAY_UNITS)) {
    return "invalid_pay_unit";
  }
  if (
    invalidCents(stepData.payExpectationMinCents) ||
    invalidCents(stepData.payExpectationMaxCents)
  ) {
    return "invalid_pay_expectation";
  }
  if (
    stepData.payExpectationMinCents != null &&
    stepData.payExpectationMaxCents != null &&
    stepData.payExpectationMaxCents < stepData.payExpectationMinCents
  ) {
    return "invalid_pay_range";
  }
  return null;
}

function sanitizeCategories(values: string[]): MarketplaceCategory[] {
  const allowed = new Set<string>(MARKETPLACE_CATEGORIES);
  const seen = new Set<string>();
  const result: MarketplaceCategory[] = [];
  for (const value of values) {
    if (allowed.has(value) && !seen.has(value)) {
      seen.add(value);
      result.push(value as MarketplaceCategory);
    }
  }
  return result;
}

function sanitizeFreeform(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const tag = raw.trim();
    if (
      tag.length > 0 &&
      tag.length <= MAX_TAG_LENGTH &&
      !seen.has(tag.toLowerCase())
    ) {
      seen.add(tag.toLowerCase());
      result.push(tag);
    }
    if (result.length >= MAX_FREEFORM_TAGS) {
      break;
    }
  }
  return result;
}
