import type { SupabaseClient } from "@supabase/supabase-js";

import { authedClient } from "../client";

/**
 * Seeker resume data access (read + bio write).
 *
 * SCHEMA RECONCILIATION (verified against supabase/migrations/003_profiles.sql,
 * 004_seeker_resume.sql and 009_clerk_user_sync_schema.sql):
 *   - `seeker_profiles` exposes `short_bio` (there is NO `bio` column) and has
 *     NO `headline` or `skills` columns. Migration 009 only added
 *     `clerk_user_id`. Per the build brief's missing-column fallback we map
 *     bio -> short_bio and silently drop headline/skills until columns exist.
 *   - `seeker_resume_experiences` / `seeker_resume_educations` match the brief
 *     and both carry a `sort_order` column used for stable ordering.
 *
 * SECURITY: these tables predate generated types (types.gen.ts is a
 * placeholder), so we cast the authed client to an untyped SupabaseClient and
 * scope every query in application code by the `seeker_profile_id` resolved from
 * the caller-supplied, already-verified `clerkUserId`. We never decode the JWT.
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
  const seekerProfileId = profileRow.id;

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
      `getSeekerResume experiences: ${experienceResult.error.message}`,
    );
  }
  if (educationResult.error) {
    throw new Error(
      `getSeekerResume educations: ${educationResult.error.message}`,
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

  return {
    profile: {
      seekerProfileId,
      bio: profileRow.short_bio ?? null,
      headline: null,
    },
    experiences,
    educations,
  };
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
