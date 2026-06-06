/**
 * Editable host_profiles columns for the host-managed profile form.
 *
 * All keys are optional: callers send only the fields they intend to change.
 * `companyName` maps to the NOT NULL `company_name` column, so an explicitly
 * provided empty value is rejected (see `updateHostProfileDetails`). The
 * remaining columns are nullable text; pass `null` to clear them.
 */
export interface HostProfileDetailsInput {
    companyName?: string;
    about?: string | null;
    primaryLocationName?: string | null;
    websiteUrl?: string | null;
}
/**
 * Resolve the caller's own host profile from their Clerk user id.
 * Returns `null` when the user has not created a host profile yet.
 *
 * @param clerkToken - Verified Clerk JWT from `getToken()`.
 * @param clerkUserId - Verified Clerk user ID from `auth().userId` — do NOT
 *   decode this from the token; pass it from the already-verified `auth()` call.
 */
export declare function getHostProfile(clerkToken: string, clerkUserId: string): Promise<{
    id: string;
    companyName: string;
    about: string | null;
    primaryLocationName: string | null;
} | null>;
/**
 * Update the caller's own host_profiles row, scoped by their verified Clerk user
 * id. Only the provided fields are written; an empty patch is a no-op success.
 *
 * `company_name` is NOT NULL, so a provided-but-empty company name is rejected
 * with `name_required` rather than writing an invalid value.
 */
export declare function updateHostProfileDetails(clerkToken: string, clerkUserId: string, fields: HostProfileDetailsInput): Promise<{
    ok: boolean;
    error?: string;
}>;
/**
 * Create a `host_profiles` row for the caller and return its new id.
 *
 * Resilient to double-submit: because `clerk_user_id` is UNIQUE, a duplicate
 * insert surfaces as a unique violation; we re-resolve the existing row and
 * return it as `{ ok: true }` rather than failing the user. Other errors return
 * `{ ok: false }`.
 */
export declare function createHostProfile(clerkToken: string, clerkUserId: string, companyName: string): Promise<{
    ok: boolean;
    id?: string;
}>;
