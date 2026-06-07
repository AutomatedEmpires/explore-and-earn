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

/**
 * Seeker onboarding write path (Wave 9 / Agent B).
 *
 * IDENTITY: clerkUserId ALWAYS comes from auth().userId — never decoded from the
 * Supabase template token. Every step is optional/skippable; the final step sets
 * onboarding_complete = true.
 */
export type OnboardingStepData = {
  displayName?: string | null;
  bio?: string | null;
  locationPref?: "remote" | "on_site" | "either" | null;
  housingPref?: "preferred" | "not_needed" | null;
  categories?: string[];
  freeformSkills?: string[];
  complete?: boolean;
};

const MAX_FREEFORM_TAGS = 10;

export async function saveOnboardingStep(
  stepData: OnboardingStepData,
): Promise<{ ok: boolean; error?: string }> {
  const { userId, getToken } = await auth();
  if (!userId) {
    return { ok: false, error: "not_authenticated" };
  }
  const token = await getToken({ template: "supabase" });
  if (!token) {
    return { ok: false, error: "no_token" };
  }

  const update: SeekerProfileUpdate = {};

  if (stepData.displayName !== undefined) {
    update.displayName = normalizeText(stepData.displayName);
  }
  if (stepData.bio !== undefined) {
    update.bio = normalizeText(stepData.bio);
  }
  if (stepData.locationPref !== undefined) {
    update.locationPref = stepData.locationPref;
  }
  if (stepData.housingPref !== undefined) {
    update.housingPref = stepData.housingPref;
  }
  if (stepData.categories !== undefined) {
    update.categories = sanitizeCategories(stepData.categories);
  }
  if (stepData.freeformSkills !== undefined) {
    update.freeformSkills = sanitizeFreeform(stepData.freeformSkills);
  }
  if (stepData.complete !== undefined) {
    update.onboardingComplete = stepData.complete;
  }

  return saveSeekerProfile(token, userId, update);
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
