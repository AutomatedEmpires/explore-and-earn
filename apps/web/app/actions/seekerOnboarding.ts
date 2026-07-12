"use server";

import { auth } from "@clerk/nextjs/server";
import {
  MARKETPLACE_CATEGORIES,
  type MarketplaceCategory,
} from "@explore-and-earn/contracts";
import {
  saveSeekerProfile,
  type SeekerProfileUpdate,
} from "@explore-and-earn/db";

import { reportError } from "../../lib/sentry";

/**
 * Seeker onboarding write path (Wave 9 / Agent B).
 *
 * IDENTITY: clerkUserId ALWAYS comes from auth().userId — never decoded from the
 * native Supabase-integrated token. Every step is optional/skippable; the final step sets
 * onboarding_complete = true (passed via complete: true from the skills step,
 * not from a client-side useEffect on the done page).
 */
export type OnboardingStepData = {
  displayName?: string | null;
  bio?: string | null;
  openToStatement?: string | null;
  locationPref?: "remote" | "on_site" | "either" | null;
  housingPref?: "preferred" | "not_needed" | null;
  mealsPref?: "required" | "preferred" | "not_needed" | "flexible" | null;
  payExpectationMinCents?: number | null;
  payExpectationMaxCents?: number | null;
  payExpectationUnit?: "hour" | "day" | "week" | "month" | "year" | "stipend" | "exchange" | "other";
  payFlexible?: boolean;
  categories?: string[];
  freeformSkills?: string[];
  complete?: boolean;
};

const MAX_FREEFORM_TAGS = 10;

async function currentUserId(): Promise<string | undefined> {
  try {
    return (await auth()).userId ?? undefined;
  } catch {
    return undefined;
  }
}

async function saveOnboardingStepImpl(
  stepData: OnboardingStepData,
): Promise<{ ok: boolean; error?: string }> {
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
    ...(stepData.locationPref !== undefined
      ? { locationPref: stepData.locationPref }
      : undefined),
    ...(stepData.housingPref !== undefined
      ? { housingPref: stepData.housingPref }
      : undefined),
    ...(stepData.mealsPref !== undefined
      ? { mealsPref: stepData.mealsPref }
      : undefined),
    ...(stepData.openToStatement !== undefined
      ? { openToStatement: stepData.openToStatement }
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
    ...(stepData.freeformSkills !== undefined
      ? { freeformSkills: sanitizeFreeform(stepData.freeformSkills) }
      : undefined),
    ...(stepData.complete !== undefined
      ? { onboardingComplete: stepData.complete }
      : undefined),
  };

  return saveSeekerProfile(token, userId, update);
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

function normalizeText(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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
    if (tag.length > 0 && !seen.has(tag.toLowerCase())) {
      seen.add(tag.toLowerCase());
      result.push(tag);
    }
    if (result.length >= MAX_FREEFORM_TAGS) {
      break;
    }
  }
  return result;
}
