import "server-only";

import type {
  SeekerBenefitPreference,
  SeekerRemotePreference,
} from "@explore-and-earn/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";

import { authedClient } from "../client";
import type { SeekerNameLookup } from "../lib/hostApplicantView";
import {
  HOST_APPLICANT_NAME_BATCH,
  emptySeekerNameLookup,
  mergeSeekerNameLookups,
  readSeekerNameLookup,
} from "../lib/hostApplicantView";

/**
 * Seeker profile data access for onboarding + profile edit.
 *
 * REUSE MAPPING (Wave 9 / Agent B): the onboarding wizard maps onto existing
 * seeker_profiles columns to minimize schema drift —
 *   bio          -> short_bio          (existing)
 *   housing_pref -> housing_preference (existing; CHECK: required|preferred|not_needed|flexible)
 *   categories   -> desired_categories (existing text[]; CHECK: subset of MARKETPLACE_CATEGORIES)
 *   desired roles -> desired_roles     (existing text[]; freeform)
 *   skills       -> general_skill_tags (existing text[]; résumé/apply gate)
 *   work setting -> remote_preference  (remote|on_site|hybrid|any)
 * location_pref remains a free-text preferred region and is not reused for the
 * work-setting choice.
 *
 * TYPES BRIDGE: types.gen.ts predates these columns, so we use an untyped
 * SupabaseClient handle and scope every query in app code by the verified
 * clerkUserId (from auth().userId — never decoded from the token), exactly like
 * savedListings.ts / applications.ts.
 */

const SEEKER_PROFILES = "seeker_profiles";

export type {
  SeekerBenefitPreference,
  SeekerRemotePreference,
} from "@explore-and-earn/contracts";
export type SeekerHousingPref = SeekerBenefitPreference;
export type SeekerMealsPref = SeekerBenefitPreference;
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
  /** Free-text preferred region, for example "Pacific Northwest". */
  readonly locationPref: string | null;
  readonly remotePreference: SeekerRemotePreference | null;
  readonly housingPreference: SeekerHousingPref | null;
  readonly mealsPreference: SeekerMealsPref | null;
  readonly payExpectationMinCents: number | null;
  readonly payExpectationMaxCents: number | null;
  readonly payExpectationUnit: SeekerPayUnit | null;
  readonly payFlexible: boolean;
  readonly desiredCategories: string[];
  readonly desiredRoles: string[];
  readonly generalSkills: string[];
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
  readonly locationPref?: string | null;
  readonly remotePreference?: SeekerRemotePreference | null;
  readonly housingPref?: SeekerHousingPref | null;
  readonly mealsPref?: SeekerMealsPref | null;
  readonly payExpectationMinCents?: number | null;
  readonly payExpectationMaxCents?: number | null;
  readonly payExpectationUnit?: SeekerPayUnit | null;
  readonly payFlexible?: boolean;
  readonly categories?: string[];
  readonly desiredRoles?: string[];
  readonly generalSkills?: string[];
  readonly onboardingComplete?: boolean;
  readonly profilePhotoUrl?: string | null;
  readonly heroCoverUrl?: string | null;
  readonly seekingTimeline?: string | null;
  readonly relativeLocation?: string | null;
}

function untypedClient(clerkToken: string): SupabaseClient {
  return authedClient(clerkToken) as unknown as SupabaseClient;
}

/** Strict reads preserve the distinction between "missing" and "failed." */
export type SeekerProfileLoadResult =
  | { readonly ok: true; readonly profile: SeekerProfileRecord | null }
  | { readonly ok: false; readonly error: string };

function mapSeekerProfile(row: Record<string, unknown>): SeekerProfileRecord {
  return {
    id: String(row.id),
    displayName: (row.display_name as string | null) ?? null,
    shortBio: (row.short_bio as string | null) ?? null,
    openToStatement: (row.open_to_statement as string | null) ?? null,
    locationPref: (row.location_pref as string | null) ?? null,
    remotePreference:
      (row.remote_preference as SeekerRemotePreference | null) ?? null,
    housingPreference:
      (row.housing_preference as SeekerHousingPref | null) ?? null,
    mealsPreference:
      (row.meals_preference as SeekerMealsPref | null) ?? null,
    payExpectationMinCents:
      typeof row.pay_expectation_min_cents === "number"
        ? row.pay_expectation_min_cents
        : null,
    payExpectationMaxCents:
      typeof row.pay_expectation_max_cents === "number"
        ? row.pay_expectation_max_cents
        : null,
    payExpectationUnit:
      (row.pay_expectation_unit as SeekerPayUnit | null) ?? null,
    payFlexible: Boolean(row.pay_flexible),
    desiredCategories: (
      (row.desired_categories as string[] | null) ?? []
    ).slice(),
    desiredRoles: ((row.desired_roles as string[] | null) ?? []).slice(),
    generalSkills: ((row.general_skill_tags as string[] | null) ?? []).slice(),
    onboardingComplete: Boolean(row.onboarding_complete),
    profilePhotoUrl: (row.profile_photo_url as string | null) ?? null,
    heroCoverUrl: (row.hero_cover_url as string | null) ?? null,
    seekingTimeline: (row.seeking_timeline as string | null) ?? null,
    relativeLocation: (row.relative_location as string | null) ?? null,
  };
}

/**
 * Strict profile read for flows that must not turn an infrastructure fault into
 * an apparently blank form. A missing row is a successful null; read failures
 * are a distinct result.
 */
export async function getSeekerProfileResult(
  clerkToken: string,
  clerkUserId: string,
): Promise<SeekerProfileLoadResult> {
  try {
    const db = untypedClient(clerkToken);
    const { data, error } = await db
      .from(SEEKER_PROFILES)
      .select(
        "id, display_name, short_bio, open_to_statement, location_pref, remote_preference, housing_preference, meals_preference, pay_expectation_min_cents, pay_expectation_max_cents, pay_expectation_unit, pay_flexible, desired_categories, desired_roles, general_skill_tags, onboarding_complete, profile_photo_url, hero_cover_url, seeking_timeline, relative_location",
      )
      .eq("clerk_user_id", clerkUserId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      return { ok: false, error: error.message };
    }
    if (!data) {
      return { ok: true, profile: null };
    }
    return {
      ok: true,
      profile: mapSeekerProfile(data as Record<string, unknown>),
    };
  } catch (caught) {
    return {
      ok: false,
      error: caught instanceof Error ? caught.message : "unknown_error",
    };
  }
}

/** Compatibility loader for existing non-critical surfaces. */
export async function getSeekerProfile(
  clerkToken: string,
  clerkUserId: string,
): Promise<SeekerProfileRecord | null> {
  const result = await getSeekerProfileResult(clerkToken, clerkUserId);
  return result.ok ? result.profile : null;
}

/**
 * Save the authed seeker's profile. Migration 073's narrow RPC creates the
 * caller's minimal row when the Clerk webhook is delayed, then this function
 * updates only the existing owner-writable columns through ordinary RLS.
 * The client never receives direct INSERT privilege or chooses an identity.
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
    if (update.remotePreference !== undefined) patch.remote_preference = update.remotePreference;
    if (update.housingPref !== undefined) patch.housing_preference = update.housingPref;
    if (update.mealsPref !== undefined) patch.meals_preference = update.mealsPref;
    if (update.payExpectationMinCents !== undefined) patch.pay_expectation_min_cents = update.payExpectationMinCents;
    if (update.payExpectationMaxCents !== undefined) patch.pay_expectation_max_cents = update.payExpectationMaxCents;
    if (update.payExpectationUnit !== undefined) patch.pay_expectation_unit = update.payExpectationUnit;
    if (update.payFlexible !== undefined) patch.pay_flexible = update.payFlexible;
    if (update.categories !== undefined) patch.desired_categories = update.categories;
    if (update.desiredRoles !== undefined) patch.desired_roles = update.desiredRoles;
    if (update.generalSkills !== undefined) patch.general_skill_tags = update.generalSkills;
    if (update.onboardingComplete !== undefined) patch.onboarding_complete = update.onboardingComplete;
    if (update.profilePhotoUrl !== undefined) patch.profile_photo_url = update.profilePhotoUrl;
    if (update.heroCoverUrl !== undefined) patch.hero_cover_url = update.heroCoverUrl;
    if (update.seekingTimeline !== undefined) patch.seeking_timeline = update.seekingTimeline;
    if (update.relativeLocation !== undefined) patch.relative_location = update.relativeLocation;

    const { data: ensuredId, error: ensureError } = await db.rpc(
      "ensure_my_seeker_profile",
    );
    if (ensureError) return { ok: false, error: ensureError.message };
    if (typeof ensuredId !== "string" || ensuredId.length === 0) {
      return { ok: false, error: "seeker_profile_create_failed" };
    }

    if (Object.keys(patch).length === 0) return { ok: true };

    // Request the updated id back. PostgREST otherwise reports a zero-row RLS
    // or deletion race as a successful UPDATE with no error.
    const { data: saved, error } = await db
      .from(SEEKER_PROFILES)
      .update(patch)
      .eq("id", ensuredId)
      .eq("clerk_user_id", clerkUserId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!saved) return { ok: false, error: "seeker_profile_update_failed" };
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
 * Batch-resolve applicant display names for a host, by seeker_profiles.id.
 *
 * Routed through migration 084's get_host_applicant_display_names. It used to
 * SELECT seeker_profiles directly, which cannot work: that table has only the
 * owner-scoped policies from 013, so a host's read was filtered to zero rows
 * with no error and every applicant on the list surfaces rendered as the
 * caller's "Seeker" placeholder.
 *
 * Ids the caller is not entitled to are simply absent from the resolved map, and
 * the RPC is bounded at HOST_APPLICANT_NAME_BATCH ids per call so it cannot be
 * used to enumerate seekers. Longer caller lists are chunked here; the database
 * raises rather than returning nothing if a caller ever exceeds the bound.
 *
 * Returns a SeekerNameLookup, not a bare map, and never throws. See the type's
 * own documentation for why this path degrades where the resume path does not:
 * in short, these names decorate list surfaces whose real content is loaded
 * elsewhere, and an RPC fault must neither take those pages down nor be
 * laundered into a placeholder that reads like an answer.
 */
export async function getSeekerDisplayNames(
  clerkToken: string,
  seekerProfileIds: string[],
): Promise<SeekerNameLookup> {
  if (seekerProfileIds.length === 0) return emptySeekerNameLookup();

  const uniqueIds = [...new Set(seekerProfileIds.filter(Boolean))];
  if (uniqueIds.length === 0) return emptySeekerNameLookup();

  let untyped: SupabaseClient;
  try {
    untyped = authedClient(clerkToken) as unknown as SupabaseClient;
  } catch (caught) {
    return {
      status: "unavailable",
      reason: `getSeekerDisplayNames: ${caught instanceof Error ? caught.message : "client unavailable"}`,
    };
  }

  let lookup = emptySeekerNameLookup();

  for (let i = 0; i < uniqueIds.length; i += HOST_APPLICANT_NAME_BATCH) {
    const batch = uniqueIds.slice(i, i + HOST_APPLICANT_NAME_BATCH);
    let response;
    try {
      response = await untyped.rpc("get_host_applicant_display_names", {
        p_seeker_profile_ids: batch,
      });
    } catch (caught) {
      return {
        status: "unavailable",
        reason: `getSeekerDisplayNames: ${caught instanceof Error ? caught.message : "batch call failed"}`,
      };
    }
    lookup = mergeSeekerNameLookups(
      lookup,
      readSeekerNameLookup("getSeekerDisplayNames", response),
    );
    if (lookup.status === "unavailable") return lookup;
  }

  return lookup;
}
