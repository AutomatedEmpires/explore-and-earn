import { authedClient } from "../client";
/**
 * Host-profile data access for the host onboarding / management experience.
 *
 * SECURITY: Row Level Security is NOT yet enabled on `host_profiles`, and
 * `authedClient()` talks to PostgREST with the anon key plus the caller's Clerk
 * JWT (the `anon` role, which performs no row-level enforcement). Every query in
 * this module is therefore scoped in application code by the caller-supplied,
 * already-verified `clerkUserId` (from `auth().userId`) \u2014 never decode it from
 * the token. Keep these manual scoping filters even once RLS lands; they are
 * defense in depth.
 */
const PENDING_ATTESTATION = "pending";
/** Postgres unique_violation SQLSTATE (host_profiles.clerk_user_id is UNIQUE). */
const UNIQUE_VIOLATION = "23505";
/** Untyped Supabase handle (see TYPES note above). */
function untypedClient(clerkToken) {
    return authedClient(clerkToken);
}
/**
 * Normalize an optional free-text field: trim, and treat an empty string as a
 * cleared (`null`) value. Leaves `null`/`undefined` untouched.
 */
function normalizeOptional(value) {
    if (value === null || value === undefined) {
        return value;
    }
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
}
/**
 * Resolve the caller's own host profile from their Clerk user id.
 * Returns `null` when the user has not created a host profile yet.
 *
 * @param clerkToken - Verified Clerk JWT from `getToken()`.
 * @param clerkUserId - Verified Clerk user ID from `auth().userId` \u2014 do NOT
 *   decode this from the token; pass it from the already-verified `auth()` call.
 */
export async function getHostProfile(clerkToken, clerkUserId) {
    const db = untypedClient(clerkToken);
    const { data, error } = await db
        .from("host_profiles")
        .select("id, company_name, about, primary_location_name, photo_url")
        .eq("clerk_user_id", clerkUserId)
        .maybeSingle();
    if (error) {
        throw new Error(`getHostProfile: ${error.message}`);
    }
    if (!data) {
        return null;
    }
    const row = data;
    return {
        id: row.id,
        companyName: row.company_name ?? "",
        about: row.about ?? null,
        primaryLocationName: row.primary_location_name ?? null,
        photoUrl: row.photo_url ?? null,
    };
}
/**
 * Update the caller's own host_profiles row, scoped by their verified Clerk user
 * id. Only the provided fields are written; an empty patch is a no-op success.
 *
 * `company_name` is NOT NULL, so a provided-but-empty company name is rejected
 * with `name_required` rather than writing an invalid value.
 */
export async function updateHostProfileDetails(clerkToken, clerkUserId, fields) {
    const patch = {};
    if (fields.companyName !== undefined) {
        const companyName = fields.companyName.trim();
        if (companyName === "") {
            return { ok: false, error: "name_required" };
        }
        patch.company_name = companyName;
    }
    if (fields.about !== undefined) {
        patch.about = normalizeOptional(fields.about) ?? null;
    }
    if (fields.primaryLocationName !== undefined) {
        patch.primary_location_name = normalizeOptional(fields.primaryLocationName) ?? null;
    }
    if (fields.websiteUrl !== undefined) {
        patch.website_url = normalizeOptional(fields.websiteUrl) ?? null;
    }
    if (fields.photoUrl !== undefined) {
        patch.photo_url = normalizeOptional(fields.photoUrl) ?? null;
    }
    if (Object.keys(patch).length === 0) {
        return { ok: true };
    }
    try {
        const db = untypedClient(clerkToken);
        const { error } = await db
            .from("host_profiles")
            .update(patch)
            .eq("clerk_user_id", clerkUserId);
        if (error) {
            return { ok: false, error: error.message };
        }
        return { ok: true };
    }
    catch (cause) {
        const message = cause instanceof Error ? cause.message : "update_failed";
        return { ok: false, error: message };
    }
}
/**
 * Create a `host_profiles` row for the caller and return its new id.
 *
 * Resilient to double-submit: because `clerk_user_id` is UNIQUE, a duplicate
 * insert surfaces as a unique violation; we re-resolve the existing row and
 * return it as `{ ok: true }` rather than failing the user. Other errors return
 * `{ ok: false }`.
 */
export async function createHostProfile(clerkToken, clerkUserId, companyName) {
    const db = untypedClient(clerkToken);
    const { data, error } = await db
        .from("host_profiles")
        .insert({
        clerk_user_id: clerkUserId,
        company_name: companyName,
        attestation_status: PENDING_ATTESTATION,
    })
        .select("id")
        .single();
    if (error) {
        if (error.code === UNIQUE_VIOLATION) {
            const existing = await getHostProfile(clerkToken, clerkUserId);
            return existing ? { ok: true, id: existing.id } : { ok: false };
        }
        return { ok: false };
    }
    return { ok: true, id: data.id };
}
