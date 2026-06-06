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

/**
 * Load the experience + education rows for an already-resolved
 * `seeker_profile_id`. Shared by the seeker-owned and host-facing resume reads
 * so the row mapping and ordering live in exactly one place.
 */
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

  if (experienceResult.error) {
    throw new Error(
      `loadResumeRows experiences: ${experienceResult.error.message}`,
    );
  }
  if (educationResult.error) {
    throw new Error(
      `loadResumeRows educations: ${educationResult.error.message}`,
    );
  }

  const experienceRows = (experienceResult.data ?? []) as ReadonlyArray<
    Record<string, unknown>
  >;
  const educationRows = (educationResult.data ?? []) as ReadonlyArray<
    Record<string, unknown>
  >;

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

/**
 * Load the seeker's resume: their `seeker_profiles` row (bio only — headline is
 * not yet a column) plus experience and education rows, scoped by the
 * `seeker_profile_id` resolved from `clerkUserId`. Returns an empty resume when
 * the seeker has no profile row yet.
 *
 * @param clerkToken - Verified Clerk JWT from `getToken({ template: "supabase" })`.
 * @param clerkUserId - Verified Clerk user ID from `auth().userId` (never decoded).
 */
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

  if (profileError) {
    throw new Error(`getSeekerResume profile: ${profileError.message}`);
  }

  if (!profileData) {
    return { profile: null, experiences: [], educations: [] };
  }

  const profileRow = profileData as SeekerProfileRow;
  const { experiences, educations } = await loadResumeRows(db, profileRow.id);

  return {
    profile: {
      seekerProfileId: profileRow.id,
      bio: profileRow.short_bio ?? null,
      headline: null,
    },
    experiences,
    educations,
  };
}

/**
 * Host-side ownership guard: returns true only when the seeker identified by
 * `seekerProfileId` has applied to at least one listing owned by the host
 * identified by `hostClerkUserId`. Reuses getHostApplications so the
 * embed/fallback ownership logic stays in exactly one place — a host can never
 * read the resume or name of a seeker who never applied to them.
 *
 * `hostClerkUserId` MUST come from `auth().userId` (already verified by Clerk),
 * never decoded from the token.
 */
async function hostCanViewSeeker(
  clerkToken: string,
  hostClerkUserId: string,
  seekerProfileId: string,
): Promise<boolean> {
  const applications = await getHostApplications(clerkToken, hostClerkUserId);
  return applications.some(
    (application) => application.seekerProfileId === seekerProfileId,
  );
}

/**
 * Host-accessible resume read by `seeker_profile_id`.
 *
 * Unlike getSeekerResume (which scopes to the caller's OWN profile), this lets a
 * host read an APPLICANT's resume — but only after the ownership guard confirms
 * the seeker applied to one of the host's listings. Returns null when the host
 * is not allowed to view this seeker or the seeker has no profile row.
 *
 * NOTE: the brief specified a single `seeker_resume` table and a
 * `SeekerResumeRow` type; neither exists in this schema. We return the existing
 * SeekerResume shape (bio via seeker_profiles.short_bio + experiences +
 * educations) so the host and seeker views stay consistent.
 *
 * @param clerkToken - Verified Clerk JWT from `getToken({ template: "supabase" })`.
 * @param hostClerkUserId - Verified host Clerk user ID from `auth().userId`.
 * @param seekerProfileId - The applicant's seeker_profiles.id.
 */
export async function getSeekerResumeByProfileId(
  clerkToken: string,
  hostClerkUserId: string,
  seekerProfileId: string,
): Promise<SeekerResume | null> {
  const allowed = await hostCanViewSeeker(
    clerkToken,
    hostClerkUserId,
    seekerProfileId,
  );
  if (!allowed) {
    return null;
  }

  const db = untypedClient(clerkToken);

  const { data: profileData, error: profileError } = await db
    .from("seeker_profiles")
    .select("id, short_bio")
    .eq("id", seekerProfileId)
    .maybeSingle();

  if (profileError) {
    throw new Error(
      `getSeekerResumeByProfileId profile: ${profileError.message}`,
    );
  }
  if (!profileData) {
    return null;
  }

  const profileRow = profileData as SeekerProfileRow;
  const { experiences, educations } = await loadResumeRows(db, profileRow.id);

  return {
    profile: {
      seekerProfileId: profileRow.id,
      bio: profileRow.short_bio ?? null,
      headline: null,
    },
    experiences,
    educations,
  };
}

/**
 * Host-accessible display name for an applicant, gated by the same ownership
 * guard as getSeekerResumeByProfileId.
 *
 * SCHEMA NOTE: `seeker_profiles` has NO `display_name` column yet. Following the
 * codebase's missing-column fallback convention, we attempt the read but treat
 * any PostgREST error (e.g. "column does not exist") as "no name available" and
 * return null rather than throwing. This is forward-compatible: once a
 * `display_name` column lands, real names flow through automatically with no
 * caller changes. Until then callers fall back to a pseudonymous handle.
 *
 * @param clerkToken - Verified Clerk JWT from `getToken({ template: "supabase" })`.
 * @param hostClerkUserId - Verified host Clerk user ID from `auth().userId`.
 * @param seekerProfileId - The applicant's seeker_profiles.id.
 */
export async function getSeekerDisplayName(
  clerkToken: string,
  hostClerkUserId: string,
  seekerProfileId: string,
): Promise<string | null> {
  const allowed = await hostCanViewSeeker(
    clerkToken,
    hostClerkUserId,
    seekerProfileId,
  );
  if (!allowed) {
    return null;
  }

  const db = untypedClient(clerkToken);

  try {
    const { data, error } = await db
      .from("seeker_profiles")
      .select("display_name")
      .eq("id", seekerProfileId)
      .maybeSingle();

    // Missing-column fallback: a "column does not exist" error (or any read
    // error) means there is no name to show yet, not a hard failure.
    if (error || !data) {
      return null;
    }

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

/**
 * Persist the seeker's bio. `bio` is written to `seeker_profiles.short_bio`.
 * `headline` is accepted for forward-compatibility but intentionally NOT written
 * — there is no `headline` column yet (per the missing-column fallback).
 *
 * Scoped by the verified `clerkUserId`; returns `{ ok: false }` with an error
 * message when the profile row is missing or the write fails.
 */
export async function updateSeekerProfileBio(
  clerkToken: string,
  clerkUserId: string,
  fields: UpdateSeekerProfileBioInput,
): Promise<{ ok: boolean; error?: string }> {
  const db = untypedClient(clerkToken);

  const updates: Record<string, string | null> = {};
  if (fields.bio !== undefined) {
    updates.short_bio = fields.bio;
  }
  // NOTE: `headline` has no column yet, so it is deliberately dropped here
  // rather than written. Re-enable once a column lands.

  if (Object.keys(updates).length === 0) {
    return { ok: true };
  }

  const { data, error } = await db
    .from("seeker_profiles")
    .update(updates)
    .eq("clerk_user_id", clerkUserId)
    .select("id");

  if (error) {
    return { ok: false, error: error.message };
  }

  if (!data || (data as unknown[]).length === 0) {
    return { ok: false, error: "seeker profile not found" };
  }

  return { ok: true };
}
