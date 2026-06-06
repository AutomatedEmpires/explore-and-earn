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
/**
 * Load the seeker's resume: their `seeker_profiles` row (bio only — headline is
 * not yet a column) plus experience and education rows, scoped by the
 * `seeker_profile_id` resolved from `clerkUserId`. Returns an empty resume when
 * the seeker has no profile row yet.
 *
 * @param clerkToken - Verified Clerk JWT from `getToken({ template: "supabase" })`.
 * @param clerkUserId - Verified Clerk user ID from `auth().userId` (never decoded).
 */
export declare function getSeekerResume(clerkToken: string, clerkUserId: string): Promise<SeekerResume>;
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
export declare function getSeekerResumeByProfileId(clerkToken: string, hostClerkUserId: string, seekerProfileId: string): Promise<SeekerResume | null>;
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
export declare function getSeekerDisplayName(clerkToken: string, hostClerkUserId: string, seekerProfileId: string): Promise<string | null>;
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
export declare function updateSeekerProfileBio(clerkToken: string, clerkUserId: string, fields: UpdateSeekerProfileBioInput): Promise<{
    ok: boolean;
    error?: string;
}>;
