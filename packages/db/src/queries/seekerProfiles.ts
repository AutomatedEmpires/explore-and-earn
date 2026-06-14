import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { authedClient } from "../client";

/**
 * Seeker profile data access for onboarding + profile edit.
 *
 * REUSE MAPPING (Wave 9 / Agent B): the onboarding wizard maps onto existing
 * seeker_profiles columns to minimize schema drift —
 *   bio          -> short_bio          (existing)
 *   housing_pref -> housing_preference (existing; CHECK: required|preferred|not_needed|flexible)
 *   skills       -> desired_categories (existing text[]; CHECK: subset of MARKETPLACE_CATEGORIES)
 *                 + desired_roles      (existing text[]; freeform)
 * Only location_pref + onboarding_complete are genuinely new (migration 017).
 *
 * TYPES BRIDGE: types.gen.ts predates these columns, so we use an untyped
 * SupabaseClient handle and scope every query in app code by the verified
 * clerkUserId (from auth().userId — never decoded from the token), exactly like
 * savedListings.ts / applications.ts.
 */

const SEEKER_PROFILES = "seeker_profiles";

export type SeekerLocationPref = "remote" | "on_site" | "either";
export type SeekerHousingPref =
  | "required"
  | "preferred"
  | "not_needed"
  | "flexible";
export type SeekerMealsPref =
  | "required"
  | "preferred"
  | "not_needed"
  | "flexible";
export type SeekerPayUnit =
  | "hour"
  | "day"
  | "week"
  | "month"
  | "year"
  | "stipend"
  | "exchange"
  | "other";

export interface SeekerProfileRecord {
  readonly id: string;
  readonly displayName: string | null;
  readonly shortBio: string | null;
  readonly openToStatement: string | null;
  readonly locationPref: SeekerLocationPref | null;
  readonly housingPreference: SeekerHousingPref | null;
  readonly mealsPreference: SeekerMealsPref | null;
  readonly payExpectationMinCents: number | null;
  readonly payExpectationMaxCents: number | null;
  readonly payExpectationUnit: SeekerPayUnit | null;
  readonly payFlexible: boolean;
  readonly desiredCategories: string[];
  readonly desiredRoles: string[];
  readonly onboardingComplete: boolean;
  readonly profilePhotoUrl: string | null;
  readonly heroCoverUrl: string | null;
  readonly seekingTimeline: string | null;
  readonly relativeLocation: string | null;
}

export interface SeekerProfileUpdate {
  readonly displayName?: string | null;
  readonly bio?: string | null;
  readonly openToStatement?: string | null;
  readonly locationPref?: SeekerLocationPref | null;
  readonly housingPref?: SeekerHousingPref | null;
  readonly mealsPref?: SeekerMealsPref | null;
  readonly payExpectationMinCents?: number | null;
  readonly payExpectationMaxCents?: number | null;
  readonly payExpectationUnit?: SeekerPayUnit | null;
  readonly payFlexible?: boolean;
  readonly categories?: string[];
  readonly freeformSkills?: string[];
  readonly onboardingComplete?: boolean;
  readonly profilePhotoUrl?: string | null;
  readonly heroCoverUrl?: string | null;
  readonly seekingTimeline?: string | null;
  readonly relativeLocation?: string | null;
}

function untypedClient(clerkToken: string): SupabaseClient {
  return authedClient(clerkToken) as unknown as SupabaseClient;
}

/**
 * Load the authed seeker's profile. Resilient by design: returns null when the
 * row is missing OR when the read errors (e.g. location_pref / onboarding_complete
 * do not exist yet because migration 017 has not been applied). Never throws, so
 * the onboarding gate degrades safely.
 */
export async function getSeekerProfile(
  clerkToken: string,
  clerkUserId: string,
): Promise<SeekerProfileRecord | null> {
  try {
    const db = untypedClient(clerkToken);
    const { data, error } = await db
      .from(SEEKER_PROFILES)
      .select(
        "id, display_name, short_bio, open_to_statement, location_pref, housing_preference, meals_preference, pay_expectation_min_cents, pay_expectation_max_cents, pay_expectation_unit, pay_flexible, desired_categories, desired_roles, onboarding_complete, profile_photo_url, hero_cover_url, seeking_timeline, relative_location",
      )
      .eq("clerk_user_id", clerkUserId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    const row = data as Record<string, unknown>;
    return {
      id: String(row.id),
      displayName: (row.display_name as string | null) ?? null,
      shortBio: (row.short_bio as string | null) ?? null,
      openToStatement: (row.open_to_statement as string | null) ?? null,
      locationPref: (row.location_pref as SeekerLocationPref | null) ?? null,
      housingPreference: (row.housing_preference as SeekerHousingPref | null) ?? null,
      mealsPreference: (row.meals_preference as SeekerMealsPref | null) ?? null,
      payExpectationMinCents: typeof row.pay_expectation_min_cents === "number" ? row.pay_expectation_min_cents : null,
      payExpectationMaxCents: typeof row.pay_expectation_max_cents === "number" ? row.pay_expectation_max_cents : null,
      payExpectationUnit: (row.pay_expectation_unit as SeekerPayUnit | null) ?? null,
      payFlexible: Boolean(row.pay_flexible),
      desiredCategories: ((row.desired_categories as string[] | null) ?? []).slice(),
      desiredRoles: ((row.desired_roles as string[] | null) ?? []).slice(),
      onboardingComplete: Boolean(row.onboarding_complete),
      profilePhotoUrl: (row.profile_photo_url as string | null) ?? null,
      heroCoverUrl: (row.hero_cover_url as string | null) ?? null,
      seekingTimeline: (row.seeking_timeline as string | null) ?? null,
      relativeLocation: (row.relative_location as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Upsert the authed seeker's profile by clerk_user_id. A brand-new seeker may
 * have no row yet, so we look up first and insert when missing. Only keys
 * present on `update` are written (every onboarding field is skippable).
 *
 * Best-effort: returns { ok: false, error } rather than throwing.
 */
export async function saveSeekerProfile(
  clerkToken: string,
  clerkUserId: string,
  update: SeekerProfileUpdate,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = untypedClient(clerkToken);

    const patch: Record<string, unknown> = {};
    if (update.displayName !== undefined) patch.display_name = update.displayName;
    if (update.bio !== undefined) patch.short_bio = update.bio;
    if (update.openToStatement !== undefined) patch.open_to_statement = update.openToStatement;
    if (update.locationPref !== undefined) patch.location_pref = update.locationPref;
    if (update.housingPref !== undefined) patch.housing_preference = update.housingPref;
    if (update.mealsPref !== undefined) patch.meals_preference = update.mealsPref;
    if (update.payExpectationMinCents !== undefined) patch.pay_expectation_min_cents = update.payExpectationMinCents;
    if (update.payExpectationMaxCents !== undefined) patch.pay_expectation_max_cents = update.payExpectationMaxCents;
    if (update.payExpectationUnit !== undefined) patch.pay_expectation_unit = update.payExpectationUnit;
    if (update.payFlexible !== undefined) patch.pay_flexible = update.payFlexible;
    if (update.categories !== undefined) patch.desired_categories = update.categories;
    if (update.freeformSkills !== undefined) patch.desired_roles = update.freeformSkills;
    if (update.onboardingComplete !== undefined) patch.onboarding_complete = update.onboardingComplete;
    if (update.profilePhotoUrl !== undefined) patch.profile_photo_url = update.profilePhotoUrl;
    if (update.heroCoverUrl !== undefined) patch.hero_cover_url = update.heroCoverUrl;
    if (update.seekingTimeline !== undefined) patch.seeking_timeline = update.seekingTimeline;
    if (update.relativeLocation !== undefined) patch.relative_location = update.relativeLocation;

    const { data: existing, error: lookupError } = await db
      .from(SEEKER_PROFILES)
      .select("id")
      .eq("clerk_user_id", clerkUserId)
      .is("deleted_at", null)
      .maybeSingle();

    if (lookupError) {
      return { ok: false, error: lookupError.message };
    }

    const existingId =
      existing && (existing as Record<string, unknown>).id
        ? String((existing as Record<string, unknown>).id)
        : null;

    if (existingId) {
      const { error } = await db
        .from(SEEKER_PROFILES)
        .update(patch)
        .eq("id", existingId);
      if (error) {
        return { ok: false, error: error.message };
      }
      return { ok: true };
    }

    const { error } = await db
      .from(SEEKER_PROFILES)
      .insert({ clerk_user_id: clerkUserId, ...patch });
    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (caught) {
    return {
      ok: false,
      error: caught instanceof Error ? caught.message : "unknown_error",
    };
  }
}

export type SeekerTravelReadiness =
  | "local_only"
  | "willing_to_travel"
  | "ready_to_relocate"
  | "remote_only"
  | "flexible";

export interface SeekerTravelPrefs {
  readonly travelReadiness: SeekerTravelReadiness;
  readonly locationPref: string;
}

// DB CHECK: available_now | date_range | flexible | unavailable
export type SeekerAvailabilityStatus =
  | "available_now"
  | "date_range"
  | "flexible"
  | "unavailable";

export interface SeekerAvailability {
  readonly availabilityStart: string | null;
  readonly availabilityEnd: string | null;
  readonly availabilityStatus: SeekerAvailabilityStatus;
}

/** Load travel_readiness + location_pref from the authed seeker's profile. */
export async function getSeekerTravelPrefs(
  clerkToken: string,
  clerkUserId: string,
): Promise<SeekerTravelPrefs> {
  const DEFAULT: SeekerTravelPrefs = { travelReadiness: "flexible", locationPref: "" };
  try {
    const db = untypedClient(clerkToken);
    const { data, error } = await db
      .from(SEEKER_PROFILES)
      .select("travel_readiness, location_pref")
      .eq("clerk_user_id", clerkUserId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error || !data) return DEFAULT;
    const row = data as Record<string, unknown>;
    const raw = row.travel_readiness;
    const travelReadiness: SeekerTravelReadiness =
      raw === "local_only" ||
      raw === "willing_to_travel" ||
      raw === "ready_to_relocate" ||
      raw === "remote_only" ||
      raw === "flexible"
        ? raw
        : DEFAULT.travelReadiness;
    return {
      travelReadiness,
      locationPref: typeof row.location_pref === "string" ? row.location_pref : "",
    };
  } catch {
    return DEFAULT;
  }
}

/** Load availability_start/end/status from the authed seeker's profile. */
export async function getSeekerAvailability(
  clerkToken: string,
  clerkUserId: string,
): Promise<SeekerAvailability> {
  const DEFAULT: SeekerAvailability = {
    availabilityStart: null,
    availabilityEnd: null,
    availabilityStatus: "flexible",
  };
  try {
    const db = untypedClient(clerkToken);
    const { data, error } = await db
      .from(SEEKER_PROFILES)
      .select("availability_start, availability_end, availability_status")
      .eq("clerk_user_id", clerkUserId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error || !data) return DEFAULT;
    const row = data as Record<string, unknown>;
    const raw = row.availability_status;
    const availabilityStatus: SeekerAvailabilityStatus =
      raw === "available_now" ||
      raw === "date_range" ||
      raw === "flexible" ||
      raw === "unavailable"
        ? raw
        : DEFAULT.availabilityStatus;
    return {
      availabilityStart: typeof row.availability_start === "string" ? row.availability_start : null,
      availabilityEnd: typeof row.availability_end === "string" ? row.availability_end : null,
      availabilityStatus,
    };
  } catch {
    return DEFAULT;
  }
}

/**
 * Batch-resolve seeker display names by internal seeker_profiles.id.
 * Missing rows and blank names fall back to "Seeker" at the caller boundary.
 */
export async function getSeekerDisplayNames(
  clerkToken: string,
  seekerProfileIds: string[],
): Promise<Map<string, string>> {
  if (seekerProfileIds.length === 0) return new Map();

  const uniqueIds = [...new Set(seekerProfileIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();

  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data } = await untyped
    .from(SEEKER_PROFILES)
    .select("id, display_name")
    .in("id", uniqueIds);

  const map = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ id: string; display_name: string | null }>) {
    const displayName = row.display_name?.trim();
    map.set(row.id, displayName && displayName.length > 0 ? displayName : "Seeker");
  }
  return map;
}
