export type SeekerLocationPref = "remote" | "on_site" | "either";
export type SeekerHousingPref = "required" | "preferred" | "not_needed" | "flexible";
export interface SeekerProfileRecord {
    readonly id: string;
    readonly displayName: string | null;
    readonly shortBio: string | null;
    readonly locationPref: SeekerLocationPref | null;
    readonly housingPreference: SeekerHousingPref | null;
    readonly desiredCategories: string[];
    readonly desiredRoles: string[];
    readonly onboardingComplete: boolean;
}
export interface SeekerProfileUpdate {
    readonly displayName?: string | null;
    readonly bio?: string | null;
    readonly locationPref?: SeekerLocationPref | null;
    readonly housingPref?: SeekerHousingPref | null;
    readonly categories?: string[];
    readonly freeformSkills?: string[];
    readonly onboardingComplete?: boolean;
}
/**
 * Load the authed seeker's profile. Resilient by design: returns null when the
 * row is missing OR when the read errors (e.g. location_pref / onboarding_complete
 * do not exist yet because migration 017 has not been applied). Never throws, so
 * the onboarding gate degrades safely.
 */
export declare function getSeekerProfile(clerkToken: string, clerkUserId: string): Promise<SeekerProfileRecord | null>;
/**
 * Upsert the authed seeker's profile by clerk_user_id. A brand-new seeker may
 * have no row yet, so we look up first and insert when missing. Only keys
 * present on `update` are written (every onboarding field is skippable).
 *
 * Best-effort: returns { ok: false, error } rather than throwing.
 */
export declare function saveSeekerProfile(clerkToken: string, clerkUserId: string, update: SeekerProfileUpdate): Promise<{
    ok: boolean;
    error?: string;
}>;
