import { adminClient } from "../adminClient";
/**
 * Admin queries run through the SERVICE ROLE client so the numbers and rows
 * reflect EVERY record, bypassing RLS (an anon/authed client would only ever
 * see its own scoped rows). Every function here takes the service-role token
 * explicitly so the secret stays an obvious, auditable input.
 *
 * Reads go through an UNTYPED client handle (same `as unknown as SupabaseClient`
 * bridge used across queries/*.ts) because the committed types.gen.ts predates
 * several columns (clerk_user_id, etc.).
 */
function firstOf(value) {
    const candidate = Array.isArray(value) ? value[0] : value;
    return candidate && typeof candidate === "object"
        ? candidate
        : null;
}
/**
 * Count rows in `table`, optionally narrowed by equality `filters`. Uses a
 * head-only exact count so no row payload crosses the wire — just the number.
 */
async function countRows(db, table, filters = {}) {
    let query = db.from(table).select("*", { count: "exact", head: true });
    for (const [column, value] of Object.entries(filters)) {
        query = query.eq(column, value);
    }
    const { count, error } = await query;
    if (error) {
        throw new Error(`getMarketplaceStats(${table}): ${error.message}`);
    }
    return count ?? 0;
}
/**
 * Live marketplace counts for the admin dashboard.
 *
 * Status/attestation vocabularies:
 *   - pendingApplications  = applications with status 'applied' (awaiting first review)
 *   - acceptedApplications = applications with status 'accepted'
 *   - verifiedHosts        = host_profiles with attestation_status 'attested'
 *   - totalSeekers         = count of seeker_profiles rows
 */
export async function getMarketplaceStats(serviceRoleToken) {
    const db = adminClient(serviceRoleToken);
    const [totalListings, liveListings, draftListings, underReviewListings, totalApplications, pendingApplications, acceptedApplications, totalHosts, verifiedHosts, totalSeekers,] = await Promise.all([
        countRows(db, "listings"),
        countRows(db, "listings", { status: "live" }),
        countRows(db, "listings", { status: "draft" }),
        countRows(db, "listings", { status: "under_review" }),
        countRows(db, "applications"),
        countRows(db, "applications", { status: "applied" }),
        countRows(db, "applications", { status: "accepted" }),
        countRows(db, "host_profiles"),
        countRows(db, "host_profiles", { attestation_status: "attested" }),
        countRows(db, "seeker_profiles"),
    ]);
    return {
        totalListings,
        liveListings,
        draftListings,
        underReviewListings,
        totalApplications,
        pendingApplications,
        acceptedApplications,
        totalHosts,
        verifiedHosts,
        totalSeekers,
    };
}
/**
 * Every listing across all statuses (draft / under_review / live / paused /
 * closed / archived), newest first, with the owning host's company name.
 */
export async function getAllListingsForModeration(serviceRoleToken) {
    const db = adminClient(serviceRoleToken);
    const { data, error } = await db
        .from("listings")
        .select("id,title,category,status,published_at,host_profiles!host_profile_id(company_name)")
        .order("created_at", { ascending: false });
    if (error) {
        throw new Error(`getAllListingsForModeration: ${error.message}`);
    }
    return (data ?? []).map((raw) => {
        const r = raw;
        const host = firstOf(r.host_profiles);
        return {
            id: String(r.id),
            title: typeof r.title === "string" ? r.title : "",
            category: typeof r.category === "string" ? r.category : "",
            status: typeof r.status === "string" ? r.status : "",
            publishedAt: typeof r.published_at === "string" ? r.published_at : null,
            hostCompanyName: host && typeof host.company_name === "string"
                ? host.company_name
                : "Unknown host",
        };
    });
}
/**
 * Every host_profiles row, newest first, with a per-host listing count. The
 * count is tallied in JS from a single listings scan (the admin set is small
 * enough that one pass beats N per-host count queries).
 */
export async function getAllHostProfiles(serviceRoleToken) {
    const db = adminClient(serviceRoleToken);
    const { data: hostRows, error: hostError } = await db
        .from("host_profiles")
        .select("id,company_name,clerk_user_id,attestation_status")
        .order("created_at", { ascending: false });
    if (hostError) {
        throw new Error(`getAllHostProfiles: ${hostError.message}`);
    }
    const { data: listingRows, error: listingError } = await db
        .from("listings")
        .select("host_profile_id");
    if (listingError) {
        throw new Error(`getAllHostProfiles(listings): ${listingError.message}`);
    }
    const listingCountByHost = new Map();
    for (const raw of listingRows ?? []) {
        const hostProfileId = String(raw.host_profile_id);
        listingCountByHost.set(hostProfileId, (listingCountByHost.get(hostProfileId) ?? 0) + 1);
    }
    return (hostRows ?? []).map((raw) => {
        const r = raw;
        const id = String(r.id);
        return {
            id,
            companyName: typeof r.company_name === "string" ? r.company_name : "",
            clerkUserId: typeof r.clerk_user_id === "string" ? r.clerk_user_id : "",
            attestationStatus: typeof r.attestation_status === "string"
                ? r.attestation_status
                : "",
            listingCount: listingCountByHost.get(id) ?? 0,
        };
    });
}
/**
 * The most recent applications (default 50), newest first by created_at, joined
 * to the listing title and the applicant's Clerk user id. Read-only view.
 */
export async function getRecentApplications(serviceRoleToken, limit = 50) {
    const db = adminClient(serviceRoleToken);
    const { data, error } = await db
        .from("applications")
        .select("id,status,created_at,listings!listing_id(title),seeker_profiles!seeker_profile_id(clerk_user_id)")
        .order("created_at", { ascending: false })
        .limit(limit);
    if (error) {
        throw new Error(`getRecentApplications: ${error.message}`);
    }
    return (data ?? []).map((raw) => {
        const r = raw;
        const listing = firstOf(r.listings);
        const seeker = firstOf(r.seeker_profiles);
        return {
            id: String(r.id),
            seekerClerkUserId: seeker && typeof seeker.clerk_user_id === "string"
                ? seeker.clerk_user_id
                : "",
            listingTitle: listing && typeof listing.title === "string" ? listing.title : "",
            status: typeof r.status === "string" ? r.status : "",
            createdAt: typeof r.created_at === "string" ? r.created_at : "",
        };
    });
}
/**
 * Approve a listing: set status = 'live', and backfill published_at = now()
 * only when it has never been set (first approval). Two writes: an
 * unconditional status update, then a published_at update filtered to rows
 * where published_at IS NULL.
 */
export async function adminApproveListing(serviceRoleToken, listingId) {
    const db = adminClient(serviceRoleToken);
    const { error: statusError } = await db
        .from("listings")
        .update({ status: "live" })
        .eq("id", listingId);
    if (statusError) {
        return { ok: false, error: statusError.message };
    }
    const { error: publishedError } = await db
        .from("listings")
        .update({ published_at: new Date().toISOString() })
        .eq("id", listingId)
        .is("published_at", null);
    if (publishedError) {
        return { ok: false, error: publishedError.message };
    }
    return { ok: true };
}
/**
 * Reject a listing: set status = 'closed'. `reason` is accepted for API parity
 * with the server action but is not persisted — the listings table has no
 * rejection-reason column (006_listings.sql) and adding one would touch the
 * schema, which is out of scope for this change.
 */
export async function adminCloseListing(serviceRoleToken, listingId, reason) {
    void reason;
    const db = adminClient(serviceRoleToken);
    const { error } = await db
        .from("listings")
        .update({ status: "closed" })
        .eq("id", listingId);
    if (error) {
        return { ok: false, error: error.message };
    }
    return { ok: true };
}
/**
 * Set a host's attestation_status to 'attested' or 'not_attested'.
 *
 * Canonical vocabulary (migration 003 CHECK constraint):
 *   not_attested | attested | attested_stale | withdrawn
 * 'attested' = admin has verified the host; 'not_attested' = reverting to
 * the default unverified state. 'attested_stale' and 'withdrawn' are set by
 * the trust lifecycle trigger, not by admin action.
 */
export async function adminSetHostAttestationStatus(serviceRoleToken, hostProfileId, attestationStatus) {
    const db = adminClient(serviceRoleToken);
    const { error } = await db
        .from("host_profiles")
        .update({ attestation_status: attestationStatus })
        .eq("id", hostProfileId);
    if (error) {
        return { ok: false, error: error.message };
    }
    return { ok: true };
}
