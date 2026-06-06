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
