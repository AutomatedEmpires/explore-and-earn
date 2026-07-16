import type { SupabaseClient } from "@supabase/supabase-js";

import { authedClient } from "../client";
import { getHostApplications } from "./applications";

/**
 * Seeker resume data access (read + bio write).
 *
 * SCHEMA RECONCILIATION (verified against supabase/migrations/003_profiles.sql,
 * 004_seeker_resume.sql, 009_clerk_user_sync_schema.sql and 032_*):
 *   - `seeker_profiles` exposes `short_bio` (there is NO `bio` column) so we map
 *     bio -> short_bio. There is still NO `headline` column (mapped to null).
 *     Migration 032 ADDED `display_name`, `relative_location`, `seeking_timeline`
 *     and `general_skill_tags`, which are now read here and are load-bearing for
 *     the résumé-complete apply gate (see @explore-and-earn/db resumeCompleteness
 *     — displayName / location / seekingTimeline / skills are required to apply).
 *   - `seeker_resume_experiences` / `seeker_resume_educations` carry a
 *     `sort_order` column used for stable ordering; resume "skills" also derive
 *     from per-experience skill_tags.
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

/** Only allow http/https credential URLs — reject javascript:, data:, etc. */
function sanitizeCredentialUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export interface SeekerResumeProfile {
  readonly seekerProfileId: string;
  readonly bio: string | null;
  readonly headline: string | null;
  /** display_name from seeker_profiles */
  readonly displayName: string | null;
  /** relative_location from seeker_profiles */
  readonly location: string | null;
  /** seeking_timeline: 'now' | '1_month' | '3_months' | '6_months' (migration 032) */
  readonly seekingTimeline: string | null;
  /** desired_categories from seeker_profiles */
  readonly desiredCategories: readonly string[];
  /** general_skill_tags from seeker_profiles (migration 032) */
  readonly generalSkills: readonly string[];
}

export interface SeekerResumeExperience {
  readonly id: string;
  readonly companyName: string | null;
  readonly roleTitle: string | null;
  /** location added in migration 032 */
  readonly location: string | null;
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
  /** location added in migration 032 */
  readonly location: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
  /** is_current added in migration 032 */
  readonly isCurrent: boolean;
  readonly description: string | null;
  readonly skillTags: readonly string[];
}

export interface SeekerCertification {
  readonly id: string;
  readonly name: string;
  readonly issuingOrganization: string | null;
  readonly issuedAt: string | null;
  readonly expiresAt: string | null;
  /** does_not_expire added in migration 032 */
  readonly doesNotExpire: boolean;
  /** description added in migration 032 */
  readonly description: string | null;
  readonly credentialUrl: string | null;
  readonly categoryTags: readonly string[];
  /** skill_tags added in migration 032 */
  readonly skillTags: readonly string[];
}

export interface SeekerResume {
  readonly profile: SeekerResumeProfile | null;
  readonly experiences: readonly SeekerResumeExperience[];
  readonly educations: readonly SeekerResumeEducation[];
  readonly certifications: readonly SeekerCertification[];
}

export interface ResumeExperienceInput {
  readonly companyName?: string;
  readonly roleTitle?: string;
  readonly location?: string | null;
  readonly startDate?: string | null;
  readonly endDate?: string | null;
  readonly isCurrent?: boolean;
  readonly summary?: string;
  readonly categoryTags?: string[];
  readonly skillTags?: string[];
}

export interface ResumeEducationInput {
  readonly institution?: string;
  readonly programOrDegree?: string;
  readonly location?: string | null;
  readonly startDate?: string | null;
  readonly endDate?: string | null;
  readonly isCurrent?: boolean;
  readonly description?: string;
  readonly skillTags?: string[];
}

export interface ResumeCertificationInput {
  readonly name: string;
  readonly issuingOrganization?: string;
  readonly issuedAt?: string | null;
  readonly expiresAt?: string | null;
  readonly doesNotExpire?: boolean;
  readonly description?: string | null;
  readonly credentialUrl?: string;
  readonly categoryTags?: string[];
  readonly skillTags?: string[];
}

export interface SeekerProfileInfoInput {
  readonly displayName?: string | null;
  readonly location?: string | null;
  readonly seekingTimeline?: string | null;
  readonly desiredCategories?: string[];
  readonly generalSkills?: string[];
}

interface SeekerProfileRow {
  readonly id: string;
  readonly short_bio: string | null;
  readonly display_name: string | null;
  readonly relative_location: string | null;
  readonly seeking_timeline: string | null;
  readonly desired_categories: string[] | null;
  readonly general_skill_tags: string[] | null;
}

async function loadResumeRows(
  db: SupabaseClient,
  seekerProfileId: string,
): Promise<{
  experiences: SeekerResumeExperience[];
  educations: SeekerResumeEducation[];
  certifications: SeekerCertification[];
}> {
  const [experienceResult, educationResult, certResult] = await Promise.all([
    db
      .from("seeker_resume_experiences")
      .select("id, company_name, role_title, location, start_date, end_date, is_current, summary, category_tags, skill_tags")
      .eq("seeker_profile_id", seekerProfileId)
      .order("sort_order", { ascending: true }),
    db
      .from("seeker_resume_educations")
      .select("id, institution, program_or_degree, location, start_date, end_date, is_current, description, skill_tags")
      .eq("seeker_profile_id", seekerProfileId)
      .order("sort_order", { ascending: true }),
    db
      .from("seeker_certifications")
      .select("id, name, issuing_organization, issued_at, expires_at, does_not_expire, description, credential_url, category_tags, skill_tags")
      .eq("seeker_profile_id", seekerProfileId)
      .order("sort_order", { ascending: true }),
  ]);

  if (experienceResult.error)
    throw new Error(`loadResumeRows experiences: ${experienceResult.error.message}`);
  if (educationResult.error)
    throw new Error(`loadResumeRows educations: ${educationResult.error.message}`);
  if (certResult.error)
    throw new Error(`loadResumeRows certifications: ${certResult.error.message}`);

  const experienceRows = (experienceResult.data ?? []) as ReadonlyArray<Record<string, unknown>>;
  const educationRows = (educationResult.data ?? []) as ReadonlyArray<Record<string, unknown>>;
  const certRows = (certResult.data ?? []) as ReadonlyArray<Record<string, unknown>>;

  const experiences: SeekerResumeExperience[] = experienceRows.map((row) => ({
    id: String(row.id),
    companyName: (row.company_name as string | null) ?? null,
    roleTitle: (row.role_title as string | null) ?? null,
    location: (row.location as string | null) ?? null,
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
    location: (row.location as string | null) ?? null,
    startDate: (row.start_date as string | null) ?? null,
    endDate: (row.end_date as string | null) ?? null,
    isCurrent: Boolean(row.is_current),
    description: (row.description as string | null) ?? null,
    skillTags: ((row.skill_tags as string[] | null) ?? []).slice(),
  }));

  const certifications: SeekerCertification[] = certRows.map((row) => ({
    id: String(row.id),
    name: String(row.name ?? ""),
    issuingOrganization: (row.issuing_organization as string | null) ?? null,
    issuedAt: (row.issued_at as string | null) ?? null,
    expiresAt: (row.expires_at as string | null) ?? null,
    doesNotExpire: Boolean(row.does_not_expire),
    description: (row.description as string | null) ?? null,
    credentialUrl: (row.credential_url as string | null) ?? null,
    categoryTags: ((row.category_tags as string[] | null) ?? []).slice(),
    skillTags: ((row.skill_tags as string[] | null) ?? []).slice(),
  }));

  return { experiences, educations, certifications };
}

export async function getSeekerResume(
  clerkToken: string,
  clerkUserId: string,
): Promise<SeekerResume> {
  const db = untypedClient(clerkToken);

  const { data: profileData, error: profileError } = await db
    .from("seeker_profiles")
    .select("id, short_bio, display_name, relative_location, seeking_timeline, desired_categories, general_skill_tags")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (profileError) throw new Error(`getSeekerResume profile: ${profileError.message}`);
  if (!profileData) return { profile: null, experiences: [], educations: [], certifications: [] };

  const profileRow = profileData as SeekerProfileRow;
  const { experiences, educations, certifications } = await loadResumeRows(db, profileRow.id);

  return {
    profile: {
      seekerProfileId: profileRow.id,
      bio: profileRow.short_bio ?? null,
      headline: null,
      displayName: profileRow.display_name ?? null,
      location: profileRow.relative_location ?? null,
      seekingTimeline: profileRow.seeking_timeline ?? null,
      desiredCategories: (profileRow.desired_categories ?? []).slice(),
      generalSkills: (profileRow.general_skill_tags ?? []).slice(),
    },
    experiences,
    educations,
    certifications,
  };
}

/**
 * Host-side ownership guard: true when the seeker applied to one of the host's
 * listings OR when a direct conversation exists between them (host-initiated).
 * `hostClerkUserId` MUST come from auth().userId.
 */
async function hostCanViewSeeker(
  clerkToken: string,
  hostClerkUserId: string,
  seekerProfileId: string,
): Promise<boolean> {
  const applications = await getHostApplications(clerkToken, hostClerkUserId);
  if (applications.some((a) => a.seekerProfileId === seekerProfileId)) return true;

  const db = untypedClient(clerkToken);
  const { data: hostRow } = await db
    .from("host_profiles")
    .select("id")
    .eq("clerk_user_id", hostClerkUserId)
    .limit(1)
    .maybeSingle();
  if (!hostRow) return false;
  const hostProfileId = (hostRow as Record<string, unknown>).id as string;

  const { data: convRow } = await db
    .from("conversations")
    .select("id")
    .eq("host_profile_id", hostProfileId)
    .eq("seeker_profile_id", seekerProfileId)
    .limit(1)
    .maybeSingle();
  return convRow != null;
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
    .select("id, short_bio, display_name, relative_location, seeking_timeline, desired_categories, general_skill_tags")
    .eq("id", seekerProfileId)
    .maybeSingle();

  if (profileError)
    throw new Error(`getSeekerResumeByProfileId profile: ${profileError.message}`);
  if (!profileData) return null;

  const profileRow = profileData as SeekerProfileRow;
  const { experiences, educations, certifications } = await loadResumeRows(db, profileRow.id);

  return {
    profile: {
      seekerProfileId: profileRow.id,
      bio: profileRow.short_bio ?? null,
      headline: null,
      displayName: profileRow.display_name ?? null,
      location: profileRow.relative_location ?? null,
      seekingTimeline: profileRow.seeking_timeline ?? null,
      desiredCategories: (profileRow.desired_categories ?? []).slice(),
      generalSkills: (profileRow.general_skill_tags ?? []).slice(),
    },
    experiences,
    educations,
    certifications,
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

/* ========================================================================== */
/* Resume CRUD — experience, education, certifications                         */
/* ========================================================================== */

/** Resolve the seeker_profile_id for the authed clerk user. */
async function resolveSeekerId(
  db: SupabaseClient,
  clerkUserId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("seeker_profiles")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  return String((data as Record<string, unknown>).id);
}

export async function addResumeExperience(
  clerkToken: string,
  clerkUserId: string,
  input: ResumeExperienceInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const db = untypedClient(clerkToken);
  const seekerProfileId = await resolveSeekerId(db, clerkUserId);
  if (!seekerProfileId) return { ok: false, error: "seeker_profile_not_found" };

  const { data, error } = await db
    .from("seeker_resume_experiences")
    .insert({
      seeker_profile_id: seekerProfileId,
      company_name: input.companyName ?? null,
      role_title: input.roleTitle ?? null,
      location: input.location ?? null,
      start_date: input.startDate ?? null,
      end_date: input.endDate ?? null,
      is_current: input.isCurrent ?? false,
      summary: input.summary ?? null,
      category_tags: input.categoryTags ?? [],
      skill_tags: input.skillTags ?? [],
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: String((data as Record<string, unknown>).id) };
}

export async function updateResumeExperience(
  clerkToken: string,
  clerkUserId: string,
  experienceId: string,
  input: ResumeExperienceInput,
): Promise<{ ok: boolean; error?: string }> {
  const db = untypedClient(clerkToken);
  const seekerProfileId = await resolveSeekerId(db, clerkUserId);
  if (!seekerProfileId) return { ok: false, error: "seeker_profile_not_found" };

  const patch: Record<string, unknown> = {};
  if (input.companyName !== undefined) patch.company_name = input.companyName;
  if (input.roleTitle !== undefined) patch.role_title = input.roleTitle;
  if (input.location !== undefined) patch.location = input.location;
  if (input.startDate !== undefined) patch.start_date = input.startDate;
  if (input.endDate !== undefined) patch.end_date = input.endDate;
  if (input.isCurrent !== undefined) patch.is_current = input.isCurrent;
  if (input.summary !== undefined) patch.summary = input.summary;
  if (input.categoryTags !== undefined) patch.category_tags = input.categoryTags;
  if (input.skillTags !== undefined) patch.skill_tags = input.skillTags;

  const { error } = await db
    .from("seeker_resume_experiences")
    .update(patch)
    .eq("id", experienceId)
    .eq("seeker_profile_id", seekerProfileId);

  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteResumeExperience(
  clerkToken: string,
  clerkUserId: string,
  experienceId: string,
): Promise<{ ok: boolean; error?: string }> {
  const db = untypedClient(clerkToken);
  const seekerProfileId = await resolveSeekerId(db, clerkUserId);
  if (!seekerProfileId) return { ok: false, error: "seeker_profile_not_found" };

  const { error } = await db
    .from("seeker_resume_experiences")
    .delete()
    .eq("id", experienceId)
    .eq("seeker_profile_id", seekerProfileId);

  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function addResumeEducation(
  clerkToken: string,
  clerkUserId: string,
  input: ResumeEducationInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const db = untypedClient(clerkToken);
  const seekerProfileId = await resolveSeekerId(db, clerkUserId);
  if (!seekerProfileId) return { ok: false, error: "seeker_profile_not_found" };

  const { data, error } = await db
    .from("seeker_resume_educations")
    .insert({
      seeker_profile_id: seekerProfileId,
      institution: input.institution ?? null,
      program_or_degree: input.programOrDegree ?? null,
      location: input.location ?? null,
      start_date: input.startDate ?? null,
      end_date: input.endDate ?? null,
      is_current: input.isCurrent ?? false,
      description: input.description ?? null,
      skill_tags: input.skillTags ?? [],
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: String((data as Record<string, unknown>).id) };
}

export async function updateResumeEducation(
  clerkToken: string,
  clerkUserId: string,
  educationId: string,
  input: ResumeEducationInput,
): Promise<{ ok: boolean; error?: string }> {
  const db = untypedClient(clerkToken);
  const seekerProfileId = await resolveSeekerId(db, clerkUserId);
  if (!seekerProfileId) return { ok: false, error: "seeker_profile_not_found" };

  const patch: Record<string, unknown> = {};
  if (input.institution !== undefined) patch.institution = input.institution;
  if (input.programOrDegree !== undefined) patch.program_or_degree = input.programOrDegree;
  if (input.location !== undefined) patch.location = input.location;
  if (input.startDate !== undefined) patch.start_date = input.startDate;
  if (input.endDate !== undefined) patch.end_date = input.endDate;
  if (input.isCurrent !== undefined) patch.is_current = input.isCurrent;
  if (input.description !== undefined) patch.description = input.description;
  if (input.skillTags !== undefined) patch.skill_tags = input.skillTags;

  const { error } = await db
    .from("seeker_resume_educations")
    .update(patch)
    .eq("id", educationId)
    .eq("seeker_profile_id", seekerProfileId);

  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteResumeEducation(
  clerkToken: string,
  clerkUserId: string,
  educationId: string,
): Promise<{ ok: boolean; error?: string }> {
  const db = untypedClient(clerkToken);
  const seekerProfileId = await resolveSeekerId(db, clerkUserId);
  if (!seekerProfileId) return { ok: false, error: "seeker_profile_not_found" };

  const { error } = await db
    .from("seeker_resume_educations")
    .delete()
    .eq("id", educationId)
    .eq("seeker_profile_id", seekerProfileId);

  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function addSeekerCertification(
  clerkToken: string,
  clerkUserId: string,
  input: ResumeCertificationInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const db = untypedClient(clerkToken);
  const seekerProfileId = await resolveSeekerId(db, clerkUserId);
  if (!seekerProfileId) return { ok: false, error: "seeker_profile_not_found" };

  const credentialUrl = input.credentialUrl
    ? sanitizeCredentialUrl(input.credentialUrl)
    : null;
  if (input.credentialUrl && credentialUrl === null) {
    return { ok: false, error: "invalid_credential_url" };
  }

  const { data, error } = await db
    .from("seeker_certifications")
    .insert({
      seeker_profile_id: seekerProfileId,
      name: input.name,
      issuing_organization: input.issuingOrganization ?? null,
      issued_at: input.issuedAt ?? null,
      expires_at: input.expiresAt ?? null,
      does_not_expire: input.doesNotExpire ?? false,
      description: input.description ?? null,
      credential_url: credentialUrl,
      category_tags: input.categoryTags ?? [],
      skill_tags: input.skillTags ?? [],
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: String((data as Record<string, unknown>).id) };
}

export async function updateSeekerCertification(
  clerkToken: string,
  clerkUserId: string,
  certId: string,
  input: Partial<ResumeCertificationInput>,
): Promise<{ ok: boolean; error?: string }> {
  const db = untypedClient(clerkToken);
  const seekerProfileId = await resolveSeekerId(db, clerkUserId);
  if (!seekerProfileId) return { ok: false, error: "seeker_profile_not_found" };

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.issuingOrganization !== undefined) patch.issuing_organization = input.issuingOrganization;
  if (input.issuedAt !== undefined) patch.issued_at = input.issuedAt;
  if (input.expiresAt !== undefined) patch.expires_at = input.expiresAt;
  if (input.doesNotExpire !== undefined) patch.does_not_expire = input.doesNotExpire;
  if (input.description !== undefined) patch.description = input.description;
  if (input.credentialUrl !== undefined) {
    const safeUrl = input.credentialUrl ? sanitizeCredentialUrl(input.credentialUrl) : null;
    if (input.credentialUrl && safeUrl === null) return { ok: false, error: "invalid_credential_url" };
    patch.credential_url = safeUrl;
  }
  if (input.categoryTags !== undefined) patch.category_tags = input.categoryTags;
  if (input.skillTags !== undefined) patch.skill_tags = input.skillTags;

  const { error } = await db
    .from("seeker_certifications")
    .update(patch)
    .eq("id", certId)
    .eq("seeker_profile_id", seekerProfileId);

  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteSeekerCertification(
  clerkToken: string,
  clerkUserId: string,
  certId: string,
): Promise<{ ok: boolean; error?: string }> {
  const db = untypedClient(clerkToken);
  const seekerProfileId = await resolveSeekerId(db, clerkUserId);
  if (!seekerProfileId) return { ok: false, error: "seeker_profile_not_found" };

  const { error } = await db
    .from("seeker_certifications")
    .delete()
    .eq("id", certId)
    .eq("seeker_profile_id", seekerProfileId);

  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Update seeker profile Info-step fields: display_name, relative_location,
 * seeking_timeline, desired_categories, general_skill_tags.
 * Added for the resume builder Info step (migration 032).
 */
export async function updateSeekerProfileInfo(
  clerkToken: string,
  clerkUserId: string,
  input: SeekerProfileInfoInput,
): Promise<{ ok: boolean; error?: string }> {
  const db = untypedClient(clerkToken);

  const patch: Record<string, unknown> = {};
  if (input.displayName !== undefined) patch.display_name = input.displayName;
  if (input.location !== undefined) patch.relative_location = input.location;
  if (input.seekingTimeline !== undefined) patch.seeking_timeline = input.seekingTimeline;
  if (input.desiredCategories !== undefined) patch.desired_categories = input.desiredCategories;
  if (input.generalSkills !== undefined) patch.general_skill_tags = input.generalSkills;

  if (Object.keys(patch).length === 0) return { ok: true };

  const { data, error } = await db
    .from("seeker_profiles")
    .update(patch)
    .eq("clerk_user_id", clerkUserId)
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!data || (data as unknown[]).length === 0)
    return { ok: false, error: "seeker_profile_not_found" };

  return { ok: true };
}
