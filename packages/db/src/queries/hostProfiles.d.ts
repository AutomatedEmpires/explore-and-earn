import "server-only";
export interface SocialLinks {
    instagram?: string | null;
    twitter?: string | null;
}
export interface HostProfileDetailsInput {
    companyName?: string;
    hostName?: string | null;
    tagline?: string | null;
    about?: string | null;
    primaryLocationName?: string | null;
    websiteUrl?: string | null;
    photoUrl?: string | null;
    socialLinks?: SocialLinks;
}
export interface HostProfile {
    id: string;
    companyName: string;
    hostName: string | null;
    tagline: string | null;
    about: string | null;
    primaryLocationName: string | null;
    photoUrl: string | null;
    websiteUrl: string | null;
    socialLinks: SocialLinks;
    categoryScopes: string[];
    housingOfferedGenerally: boolean;
    mealsOfferedGenerally: boolean;
    subscriptionTier: "none" | "starter" | "professional" | "enterprise";
}
export declare function getHostProfile(clerkToken: string, clerkUserId: string): Promise<HostProfile | null>;
export declare function updateHostProfileDetails(clerkToken: string, clerkUserId: string, fields: HostProfileDetailsInput): Promise<{
    ok: boolean;
    error?: string;
}>;
export declare function createHostProfile(clerkToken: string, clerkUserId: string, companyName: string): Promise<{
    ok: boolean;
    id?: string;
}>;
/** Host profile fields needed by the public /host/[id] page. */
export interface PublicHostProfile {
    id: string;
    companyName: string;
    hostName: string | null;
    tagline: string | null;
    about: string | null;
    primaryLocationName: string | null;
    photoUrl: string | null;
    websiteUrl: string | null;
    socialLinks: SocialLinks;
    categoryScopes: string[];
    housingOfferedGenerally: boolean;
    mealsOfferedGenerally: boolean;
    attestationStatus: string;
    createdAt: string | null;
}
/**
 * Fetch a host's public profile by host_profiles.id. Anon client — no auth
 * required. Returns null when the profile does not exist.
 */
export declare function getPublicHostProfile(hostProfileId: string): Promise<PublicHostProfile | null>;
/** A live listing as surfaced on the host's public profile page. */
export interface PublicHostListing {
    id: string;
    title: string;
    category: string;
    coverPhotoUrl: string | null;
    locationDisplay: string | null;
    housingIncluded: boolean;
    mealsIncluded: boolean;
    compensationSummary: string | null;
    compensationMinCents: number | null;
    compensationMaxCents: number | null;
    compensationUnit: string | null;
    compensationCurrency: string;
    publishedAt: string | null;
}
/**
 * Fetch all live listings for a host, ordered by published_at DESC.
 * Anon client — no auth required.
 */
export declare function getPublicListingsByHost(hostProfileId: string): Promise<PublicHostListing[]>;
