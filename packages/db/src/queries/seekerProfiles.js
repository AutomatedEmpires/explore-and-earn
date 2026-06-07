import { authedClient } from "../client";
/**
 * Seeker profile data access for onboarding + profile edit.
 *
 * REUSE MAPPING (Wave 9 / Agent B): the onboarding wizard maps onto existing
 * seeker_profiles columns to minimize schema drift —
 *   bio          -> short_bio          (existing)
 *   housing_pref -> housing_preference (existing; CHECK: required|preferred|not_needed|flexible)
 *   skills       -> desired_categories (existing text[]; CHECK: subset of MARKETPLACE_CATEGORIES)
 *                 + desired_roles      (existing text[]; freeform)
 * Only location_pref + onboarding_complete are genuinely new (migration 017).
 *
 * TYPES BRIDGE: types.gen.ts predates these columns, so we use an untyped
 * SupabaseClient handle and scope every query in app code by the verified
 * clerkUserId (from auth().userId — never decoded from the token), exactly like
 * savedListings.ts / applications.ts.
 */
const SEEKER_PROFILES = "seeker_profiles";
function untypedClient(clerkToken) {
    return authedClient(clerkToken);
}
/**
 * Load the authed seeker's profile. Resilient by design: returns null when the
 * row is missing OR when the read errors (e.g. location_pref / onboarding_complete
 * do not exist yet because migration 017 has not been applied). Never throws, so
 * the onboarding gate degrades safely.
 */
export async function getSeekerProfile(clerkToken, clerkUserId) {
    try {
        const db = untypedClient(clerkToken);
        const { data, error } = await db
            .from(SEEKER_PROFILES)
            .select("id, display_name, short_bio, location_pref, housing_preference, desired_categories, desired_roles, onboarding_complete")
            .eq("clerk_user_id", clerkUserId)
            .is("deleted_at", null)
            .maybeSingle();
        if (error || !data) {
            return null;
        }
        const row = data;
        return {
            id: String(row.id),
            displayName: row.display_name ?? null,
            shortBio: row.short_bio ?? null,
            locationPref: row.location_pref ?? null,
            housingPreference: row.housing_preference ?? null,
            desiredCategories: (row.desired_categories ?? []).slice(),
            desiredRoles: (row.desired_roles ?? []).slice(),
            onboardingComplete: Boolean(row.onboarding_complete),
        };
    }
    catch {
        return null;
    }
}
/**
 * Upsert the authed seeker's profile by clerk_user_id. A brand-new seeker may
 * have no row yet, so we look up first and insert when missing. Only keys
 * present on `update` are written (every onboarding field is skippable).
 *
 * Best-effort: returns { ok: false, error } rather than throwing.
 */
export async function saveSeekerProfile(clerkToken, clerkUserId, update) {
    try {
        const db = untypedClient(clerkToken);
        const patch = {};
        if (update.displayName !== undefined) {
            patch.display_name = update.displayName;
        }
        if (update.bio !== undefined) {
            patch.short_bio = update.bio;
        }
        if (update.locationPref !== undefined) {
            patch.location_pref = update.locationPref;
        }
        if (update.housingPref !== undefined) {
            patch.housing_preference = update.housingPref;
        }
        if (update.categories !== undefined) {
            patch.desired_categories = update.categories;
        }
        if (update.freeformSkills !== undefined) {
            patch.desired_roles = update.freeformSkills;
        }
        if (update.onboardingComplete !== undefined) {
            patch.onboarding_complete = update.onboardingComplete;
        }
        const { data: existing, error: lookupError } = await db
            .from(SEEKER_PROFILES)
            .select("id")
            .eq("clerk_user_id", clerkUserId)
            .is("deleted_at", null)
            .maybeSingle();
        if (lookupError) {
            return { ok: false, error: lookupError.message };
        }
        const existingId = existing && existing.id
            ? String(existing.id)
            : null;
        if (existingId) {
            const { error } = await db
                .from(SEEKER_PROFILES)
                .update(patch)
                .eq("id", existingId);
            if (error) {
                return { ok: false, error: error.message };
            }
            return { ok: true };
        }
        const { error } = await db
            .from(SEEKER_PROFILES)
            .insert({ clerk_user_id: clerkUserId, ...patch });
        if (error) {
            return { ok: false, error: error.message };
        }
        return { ok: true };
    }
    catch (caught) {
        return {
            ok: false,
            error: caught instanceof Error ? caught.message : "unknown_error",
        };
    }
}
