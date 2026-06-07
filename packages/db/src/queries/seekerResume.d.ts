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
export declare function getSeekerResume(clerkToken: string, clerkUserId: string): Promise<SeekerResume>;
export declare function getSeekerResumeByProfileId(clerkToken: string, hostClerkUserId: string, seekerProfileId: string): Promise<SeekerResume | null>;
export declare function getSeekerDisplayName(clerkToken: string, hostClerkUserId: string, seekerProfileId: string): Promise<string | null>;
export interface UpdateSeekerProfileBioInput {
    readonly bio?: string | null;
    readonly headline?: string | null;
}
export declare function updateSeekerProfileBio(clerkToken: string, clerkUserId: string, fields: UpdateSeekerProfileBioInput): Promise<{
    ok: boolean;
    error?: string;
}>;
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
export declare function getSeekerProfileForHost(clerkToken: string, hostClerkUserId: string, seekerProfileId: string): Promise<SeekerProfileForHost | null>;
