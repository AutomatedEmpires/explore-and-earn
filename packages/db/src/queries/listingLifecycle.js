import "server-only";
import { authedClient } from "../client";
/**
 * Host-initiated listing status transitions (Agent 3 / PR 1).
 *
 * The server is the authoritative gate; the client mirrors this map only to
 * decide which action buttons to show. Note: there is intentionally NO
 * under_review -> live edge — publishing a reviewed listing to live is a
 * separate approval flow outside this host control set.
 */
const LISTING_STATUS_TRANSITIONS = {
    draft: ["under_review"],
    under_review: ["draft"],
    live: ["paused", "archived"],
    paused: ["live", "archived"],
    closed: [],
    archived: [],
};
/** True when `from -> to` is a permitted host listing transition. */
export function canTransitionListing(from, to) {
    return (LISTING_STATUS_TRANSITIONS[from] ?? []).includes(to);
}
/**
 * Resolve host_profiles.id for the authed Clerk user. Replicated locally (the
 * listings.ts copy is private) so this module stays self-contained.
 */
async function resolveHostProfileId(clerkToken, clerkUserId) {
    const db = authedClient(clerkToken);
    const { data, error } = await db
        .from("host_profiles")
        .select("id")
        .eq("clerk_user_id", clerkUserId)
        .maybeSingle();
    if (error)
        throw new Error(`resolveHostProfileId: ${error.message}`);
    return data ? data.id : null;
}
/**
 * Move a listing to a new lifecycle status. Validates the transition and
 * confirms the authed user's host profile owns the listing before writing.
 * Returns { ok: false, error: 'invalid_transition' } for a disallowed edge.
 *
 * `clerkUserId` MUST come from auth().userId (never decoded from the token).
 */
export async function updateListingStatus(clerkToken, clerkUserId, listingId, newStatus) {
    if (!listingId)
        return { ok: false, error: "Missing listing id." };
    const hostProfileId = await resolveHostProfileId(clerkToken, clerkUserId);
    if (!hostProfileId)
        return { ok: false, error: "No host profile found for your account." };
    const db = authedClient(clerkToken);
    const { data: existing, error: readError } = await db
        .from("listings")
        .select("id,status")
        .eq("id", listingId)
        .eq("host_profile_id", hostProfileId)
        .maybeSingle();
    if (readError)
        return { ok: false, error: readError.message };
    if (!existing) {
        return { ok: false, error: "Listing not found or you do not have access to it." };
    }
    const current = existing.status;
    if (current === newStatus)
        return { ok: true, status: newStatus };
    if (!canTransitionListing(current, newStatus)) {
        return { ok: false, error: "invalid_transition" };
    }
    const nowIso = new Date().toISOString();
    const patch = { status: newStatus };
    if (newStatus === "live")
        patch.published_at = nowIso;
    else if (newStatus === "paused")
        patch.paused_at = nowIso;
    else if (newStatus === "archived")
        patch.archived_at = nowIso;
    const { data: updated, error: updateError } = await db
        .from("listings")
        .update(patch)
        .eq("id", listingId)
        .eq("host_profile_id", hostProfileId)
        .select("id")
        .maybeSingle();
    if (updateError)
        return { ok: false, error: updateError.message };
    if (!updated) {
        return { ok: false, error: "Listing not found or you do not have access to it." };
    }
    return { ok: true, status: newStatus };
}
const COPYABLE_LISTING_COLUMNS = "title,category,description,location_display,latitude,longitude," +
    "housing_included,meals_included,compensation_summary,compensation_min_cents," +
    "compensation_max_cents,compensation_unit,compensation_currency,timeline_summary," +
    "begins_at,ends_at,cover_photo_url";
/**
 * Duplicate a listing the authed user owns — for recurring seasonal reposts.
 * Clones the editable fields, resets the lifecycle to a fresh draft, and
 * appends " (copy)" to the title. The cover photo URL stays linked. Lifecycle
 * timestamps and role counts fall back to DB defaults, and expires_at is
 * reseeded by the 022 insert trigger (a duplicate gets a fresh 90-day window).
 *
 * `clerkUserId` MUST come from auth().userId.
 */
export async function duplicateListing(clerkToken, clerkUserId, listingId) {
    if (!listingId)
        return { ok: false, error: "Missing listing id." };
    const hostProfileId = await resolveHostProfileId(clerkToken, clerkUserId);
    if (!hostProfileId)
        return { ok: false, error: "No host profile found for your account." };
    const db = authedClient(clerkToken);
    const { data: source, error: readError } = await db
        .from("listings")
        .select(COPYABLE_LISTING_COLUMNS)
        .eq("id", listingId)
        .eq("host_profile_id", hostProfileId)
        .maybeSingle();
    if (readError)
        return { ok: false, error: readError.message };
    if (!source) {
        return { ok: false, error: "Listing not found or you do not have access to it." };
    }
    const row = source;
    const baseTitle = typeof row.title === "string" && row.title.trim().length > 0
        ? row.title
        : "Untitled listing";
    const insertRow = {
        ...row,
        host_profile_id: hostProfileId,
        title: `${baseTitle} (copy)`,
        status: "draft",
    };
    const { data: created, error: insertError } = await db
        .from("listings")
        .insert(insertRow)
        .select("id")
        .single();
    if (insertError || !created) {
        return { ok: false, error: insertError?.message ?? "Could not duplicate the listing." };
    }
    return { ok: true, newListingId: created.id };
}
