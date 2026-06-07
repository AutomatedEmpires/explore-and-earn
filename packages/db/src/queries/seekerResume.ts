import type { SupabaseClient } from "@supabase/supabase-js";

import { authedClient } from "../client";
import { getHostApplications } from "./applications";

/**
 * Seeker resume data access (read + bio write).
 *
 * SCHEMA RECONCILIATION (verified against supabase/migrations/003_profiles.sql,
 * 004_seeker_resume.sql and 009_clerk_user_sync_schema.sql):
 *   - `seeker_profiles` exposes `short_bio` (there is NO `bio` column) and has
 *     NO `headline`, `display_name` or `skills` columns. Migration 009 only
 *     added `clerk_user_id`. Per the build brief's missing-column fallback we
 *     map bio -> short_bio, derive resume "skills" from per-experience
 *     skill_tags, and treat display_name as not-yet-available (see
 *     getSeekerDisplayName) until a column lands.
 *   - `seeker_resume_experiences` / `seeker_resume_educations` match the brief
 *     and both carry a `sort_order` column used for stable ordering.
 *
 * SECURITY: these tables predate generated types (types.gen.ts is a
 * placeholder), so we cast the authed client to an untyped SupabaseClient and
 * scope every query in application code. Seeker-owned reads resolve the
 * `seeker_profile_id` from the caller-supplied, already-verified `clerkUserId`;
 * host-facing reads (by seeker_profile_id) are gated by an ownership guard that
 * confirms the seeker actually applied to one of the host's listings. We never
 * decode the JWT.
 */

/** Untyped Supabase handle for tables not yet in types.gen.ts. */
function untypedClient(clerkToken: string): SupabaseClient {
  return authedClient(clerkToken) as unknown as SupabaseClient;
}

export interface SeekerResumeProfile {
  readonly seekerProfileId: string;
  /** Maps to seeker_profiles.short_bio. */
  readonly bio: string | null;
  /** No column yet (009 only added clerk_user_id); always null for now. */
  readonly headline: string | null;
}

export interface SeekerResumeExperience {
  readonly id: string;
  readonly companyName: string | null;
  readonly roleTitle: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly isCurrent: boolean;
  readonly summary: string | null;
  readonly categoryTags: readonly string[];
  readonly skillTags: readonly string[];
}

export interface SeekerResumeEducation {
  readonly id: string;
  readonly institution: string | null;
  readonly programOrDegree: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
}

export interface SeekerResume {
  readonly profile: SeekerResumeProfile | null;
  readonly experiences: readonly SeekerResumeExperience[];
  readonly educations: readonly SeekerResumeEducation[];
}

interface SeekerProfileRow {
  readonly id: string;
  readonly short_bio: string | null;
}

async function loadResumeRows(
  db: SupabaseClient,
  seekerProfileId: string,
): Promise<{
  experiences: SeekerResumeExperience[];
  educations: SeekerResumeEducation[];
}> {
  const [experienceResult, educationResult] = await Promise.all([
    db
      .from("seeker_resume_experiences")
      .select(
        "id, company_name, role_title, start_date, end_date, is_current, summary, category_tags, skill_tags",
      )
      .eq("seeker_profile_id", seekerProfileId)
      .order("sort_order", { ascending: true }),
    db
      .from("seeker_resume_educations")
      .select("id, institution, program_or_degree, start_date, end_date")
      .eq("seeker_profile_id", seekerProfileId)
      .order("sort_order", { ascending: true }),
  ]);

  if (experienceResult.error)
    throw new Error(`loadResumeRows experiences: ${experienceResult.error.message}`);
  if (educationResult.error)
    throw new Error(`loadResumeRows educations: ${educationResult.error.message}`);

  const experienceRows = (experienceResult.data ?? []) as ReadonlyArray<Record<string, unknown>>;
  const educationRows = (educationResult.data ?? []) as ReadonlyArray<Record<string, unknown>>;

  const experiences: SeekerResumeExperience[] = experienceRows.map((row) => ({
    id: String(row.id),
    companyName: (row.company_name as string | null) ?? null,
    roleTitle: (row.role_title as string | null) ?? null,
    startDate: (row.start_date as string | null) ?? null,
    endDate: (row.end_date as string | null) ?? null,
    isCurrent: Boolean(row.is_current),
    summary: (row.summary as string | null) ?? null,
    categoryTags: ((row.category_tags as string[] | null) ?? []).slice(),
    skillTags: ((row.skill_tags as string[] | null) ?? []).slice(),
  }));

  const educations: SeekerResumeEducation[] = educationRows.map((row) => ({
    id: String(row.id),
    institution: (row.institution as string | null) ?? null,
    programOrDegree: (row.program_or_degree as string | null) ?? null,
    startDate: (row.start_date as string | null) ?? null,
    endDate: (row.end_date as string | null) ?? null,
  }));

  return { experiences, educations };
}

export async function getSeekerResume(
  clerkToken: string,
  clerkUserId: string,
): Promise<SeekerResume> {
  const db = untypedClient(clerkToken);

  const { data: profileData, error: profileError } = await db
    .from("seeker_profiles")
    .select("id, short_bio")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (profileError) throw new Error(`getSeekerResume profile: ${profileError.message}`);
  if (!profileData) return { profile: null, experiences: [], educations: [] };

  const profileRow = profileData as SeekerProfileRow;
  const { experiences, educations } = await loadResumeRows(db, profileRow.id);

  return {
    profile: { seekerProfileId: profileRow.id, bio: profileRow.short_bio ?? null, headline: null },
    experiences,
    educations,
  };
}

/**
 * Host-side ownership guard: true only when the seeker applied to at least one
 * listing owned by this host. `hostClerkUserId` MUST come from auth().userId.
 */
async function hostCanViewSeeker(
  clerkToken: string,
  hostClerkUserId: string,
  seekerProfileId: string,
): Promise<boolean> {
  const applications = await getHostApplications(clerkToken, hostClerkUserId);
  return applications.some((a) => a.seekerProfileId === seekerProfileId);
}

export async function getSeekerResumeByProfileId(
  clerkToken: string,
  hostClerkUserId: string,
  seekerProfileId: string,
): Promise<SeekerResume | null> {
  const allowed = await hostCanViewSeeker(clerkToken, hostClerkUserId, seekerProfileId);
  if (!allowed) return null;

  const db = untypedClient(clerkToken);

  const { data: profileData, error: profileError } = await db
    .from("seeker_profiles")
    .select("id, short_bio")
    .eq("id", seekerProfileId)
    .maybeSingle();

  if (profileError)
    throw new Error(`getSeekerResumeByProfileId profile: ${profileError.message}`);
  if (!profileData) return null;

  const profileRow = profileData as SeekerProfileRow;
  const { experiences, educations } = await loadResumeRows(db, profileRow.id);

  return {
    profile: { seekerProfileId: profileRow.id, bio: profileRow.short_bio ?? null, headline: null },
    experiences,
    educations,
  };
}

export async function getSeekerDisplayName(
  clerkToken: string,
  hostClerkUserId: string,
  seekerProfileId: string,
): Promise<string | null> {
  const allowed = await hostCanViewSeeker(clerkToken, hostClerkUserId, seekerProfileId);
  if (!allowed) return null;

  const db = untypedClient(clerkToken);

  try {
    const { data, error } = await db
      .from("seeker_profiles")
      .select("display_name")
      .eq("id", seekerProfileId)
      .maybeSingle();

    if (error || !data) return null;

    const value = (data as Record<string, unknown>).display_name;
    return typeof value === "string" && value.trim().length > 0 ? value : null;
  } catch {
    return null;
  }
}

export interface UpdateSeekerProfileBioInput {
  readonly bio?: string | null;
  readonly headline?: string | null;
}

export async function updateSeekerProfileBio(
  clerkToken: string,
  clerkUserId: string,
  fields: UpdateSeekerProfileBioInput,
): Promise<{ ok: boolean; error?: string }> {
  const db = untypedClient(clerkToken);

  const updates: Record<string, string | null> = {};
  if (fields.bio !== undefined) updates.short_bio = fields.bio;

  if (Object.keys(updates).length === 0) return { ok: true };

  const { data, error } = await db
    .from("seeker_profiles")
    .update(updates)
    .eq("clerk_user_id", clerkUserId)
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!data || (data as unknown[]).length === 0)
    return { ok: false, error: "seeker profile not found" };

  return { ok: true };
}

/* ========================================================================== */
/* Wave 10 — host-gated seeker profile for public seeker page                 */
/* ========================================================================== */

/**
 * Seeker profile fields exposed to a host on the /host/seeker/[id] page.
 * Only available when the seeker applied to one of the host's listings.
 * visibility_status is read defensively (column may not exist yet).
 */
export interface SeekerProfileForHost {
  readonly seekerProfileId: string;
  readonly displayName: string | null;
  readonly shortBio: string | null;
  readonly locationPref: string | null;
  readonly housingPreference: string | null;
  readonly desiredCategories: readonly string[];
  readonly desiredRoles: readonly string[];
  readonly onboardingComplete: boolean;
  readonly visibilityStatus: string | null;
}

/**
 * Fetch a seeker's profile for a host viewer. Gated by hostCanViewSeeker
 * (seeker must have applied to one of the host's listings). Reads
 * visibility_status defensively, falling back without the column if PostgREST
 * errors. Returns null when the host is not allowed or the profile is missing.
 *
 * `hostClerkUserId` MUST come from auth().userId.
 */
export async function getSeekerProfileForHost(
  clerkToken: string,
  hostClerkUserId: string,
  seekerProfileId: string,
): Promise<SeekerProfileForHost | null> {
  const allowed = await hostCanViewSeeker(
    clerkToken,
    hostClerkUserId,
    seekerProfileId,
  );
  if (!allowed) return null;

  const db = untypedClient(clerkToken);
  const baseColumns =
    "id, display_name, short_bio, location_pref, housing_preference, desired_categories, desired_roles, onboarding_complete";

  let row: Record<string, unknown> | null = null;
  let visibilityStatus: string | null = null;

  // Attempt read with visibility_status; fall back if the column is absent.
  const withVis = await db
    .from("seeker_profiles")
    .select(`${baseColumns}, visibility_status`)
    .eq("id", seekerProfileId)
    .maybeSingle();

  if (!withVis.error && withVis.data) {
    row = withVis.data as Record<string, unknown>;
    visibilityStatus =
      typeof row.visibility_status === "string" ? row.visibility_status : null;
  } else {
    const base = await db
      .from("seeker_profiles")
      .select(baseColumns)
      .eq("id", seekerProfileId)
      .maybeSingle();
    if (base.error || !base.data) return null;
    row = base.data as Record<string, unknown>;
  }

  if (!row) return null;

  return {
    seekerProfileId: String(row.id),
    displayName:
      typeof row.display_name === "string" ? row.display_name : null,
    shortBio: typeof row.short_bio === "string" ? row.short_bio : null,
    locationPref:
      typeof row.location_pref === "string" ? row.location_pref : null,
    housingPreference:
      typeof row.housing_preference === "string"
        ? row.housing_preference
        : null,
    desiredCategories: (
      (row.desired_categories as string[] | null) ?? []
    ).slice(),
    desiredRoles: (
      (row.desired_roles as string[] | null) ?? []
    ).slice(),
    onboardingComplete: Boolean(row.onboarding_complete),
    visibilityStatus,
  };
}
