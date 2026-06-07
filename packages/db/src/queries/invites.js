import "server-only";
import { authedClient } from "../client";
/**
 * Resolve seeker_profiles.id for the authed Clerk user.
 *
 * `clerkUserId` must come from `auth().userId` — never decode it from the token.
 */
async function resolveSeekerProfileId(clerkToken, clerkUserId) {
    const untyped = authedClient(clerkToken);
    const { data, error } = await untyped
        .from("seeker_profiles")
        .select("id")
        .eq("clerk_user_id", clerkUserId)
        .maybeSingle();
    if (error) {
        throw new Error(`resolveSeekerProfileId: ${error.message}`);
    }
    return data ? data.id : null;
}
function firstOf(value) {
    const candidate = Array.isArray(value) ? value[0] : value;
    return candidate && typeof candidate === "object"
        ? candidate
        : null;
}
function embeddedCompensationSummary(row) {
    if (typeof row.compensation_summary === "string" &&
        row.compensation_summary.length > 0) {
        return row.compensation_summary;
    }
    const minCents = typeof row.compensation_min_cents === "number"
        ? row.compensation_min_cents
        : null;
    if (minCents != null) {
        const unit = typeof row.compensation_unit === "string"
            ? row.compensation_unit
            : "other";
        const currency = typeof row.compensation_currency === "string"
            ? row.compensation_currency
            : "USD";
        const fmt = (cents) => new Intl.NumberFormat("en-US", {
            style: "currency",
            currency,
            maximumFractionDigits: 0,
        }).format(cents / 100);
        const min = fmt(minCents);
        const maxCents = typeof row.compensation_max_cents === "number"
            ? row.compensation_max_cents
            : null;
        const max = maxCents != null ? fmt(maxCents) : null;
        const range = max && max !== min ? `${min}\u2013${max}` : min;
        return unit === "other" || unit === "exchange" || unit === "stipend"
            ? range
            : `${range}/${unit}`;
    }
    return "Negotiable";
}
function embeddedOpportunityWindow(row) {
    if (typeof row.timeline_summary === "string" &&
        row.timeline_summary.length > 0) {
        return row.timeline_summary;
    }
    return "Open";
}
function rowToInviteListing(listingValue, hostValue) {
    const row = firstOf(listingValue);
    if (!row) {
        return null;
    }
    const host = firstOf(hostValue);
    const hostName = host && typeof host.company_name === "string" && host.company_name.length > 0
        ? host.company_name
        : "Unknown Host";
    const verified = host != null && host.attestation_status === "attested";
    const housingProvision = row.housing_included === true ? "provided" : "not_provided";
    const mealsProvision = row.meals_included === true ? "provided" : "not_provided";
    const benefits = {
        housing: { provision: housingProvision },
        meals: { provision: mealsProvision },
        pay: {
            provision: "provided",
            summary: embeddedCompensationSummary(row),
        },
    };
    return {
        id: String(row.id),
        title: typeof row.title === "string" ? row.title : "",
        category: (typeof row.category === "string"
            ? row.category
            : "mix"),
        location: typeof row.location_display === "string" &&
            row.location_display.length > 0
            ? row.location_display
            : "Location not specified",
        opportunityWindow: embeddedOpportunityWindow(row),
        status: (typeof row.status === "string"
            ? row.status
            : "live"),
        host: { name: hostName, verified },
        benefits,
    };
}
const INVITE_SELECT = "id, listing_id, host_profile_id, status, message, created_at, " +
    "listings!listing_id(id, title, category, location_display, status, housing_included, meals_included, compensation_summary, compensation_min_cents, compensation_max_cents, compensation_unit, compensation_currency, timeline_summary), " +
    "host_profiles!host_profile_id(company_name, attestation_status)";
export async function getSeekerInvites(clerkToken, clerkUserId) {
    const seekerProfileId = await resolveSeekerProfileId(clerkToken, clerkUserId);
    if (!seekerProfileId) {
        return [];
    }
    const untyped = authedClient(clerkToken);
    const { data, error } = await untyped
        .from("invites")
        .select(INVITE_SELECT)
        .eq("seeker_profile_id", seekerProfileId)
        .neq("status", "withdrawn")
        .order("created_at", { ascending: false });
    if (error) {
        throw new Error(`getSeekerInvites: ${error.message}`);
    }
    return (data ?? []).map((raw) => {
        const r = raw;
        return {
            invite: {
                id: String(r.id),
                listingId: String(r.listing_id),
                hostProfileId: String(r.host_profile_id),
                status: typeof r.status === "string" ? r.status : "created",
                message: typeof r.message === "string" ? r.message : null,
                createdAt: typeof r.created_at === "string" ? r.created_at : "",
            },
            listing: rowToInviteListing(r.listings, r.host_profiles),
        };
    });
}
const RESPONSE_TARGET = {
    accepted: "applied",
    declined: "ignored",
};
const LIVE_INVITE_STATES = new Set(["created", "delivered", "viewed"]);
function invitePath(from, target) {
    if (!LIVE_INVITE_STATES.has(from)) {
        return null;
    }
    if (target === "ignored") {
        return ["ignored"];
    }
    return from === "created" ? ["delivered", "applied"] : ["applied"];
}
export async function respondToInvite(clerkToken, clerkUserId, inviteId, response) {
    const target = RESPONSE_TARGET[response];
    if (!target) {
        return { ok: false, error: "invalid_response" };
    }
    const seekerProfileId = await resolveSeekerProfileId(clerkToken, clerkUserId);
    if (!seekerProfileId) {
        return { ok: false, error: "profile_not_found" };
    }
    const untyped = authedClient(clerkToken);
    const { data: inviteRow, error: loadError } = await untyped
        .from("invites")
        .select("id, status")
        .eq("id", inviteId)
        .eq("seeker_profile_id", seekerProfileId)
        .maybeSingle();
    if (loadError) {
        return { ok: false, error: loadError.message };
    }
    if (!inviteRow) {
        return { ok: false, error: "not_found" };
    }
    const current = typeof inviteRow.status === "string"
        ? String(inviteRow.status)
        : "";
    if (current === target) {
        return { ok: true };
    }
    const path = invitePath(current, target);
    if (!path) {
        return { ok: false, error: "already_responded" };
    }
    for (const next of path) {
        const { error: updateError } = await untyped
            .from("invites")
            .update({ status: next })
            .eq("id", inviteId)
            .eq("seeker_profile_id", seekerProfileId);
        if (updateError) {
            return { ok: false, error: updateError.message };
        }
    }
    return { ok: true };
}
// ---------------------------------------------------------------------------
// Host-side invite functions
// ---------------------------------------------------------------------------
async function resolveHostProfileId(clerkToken, clerkUserId) {
    const untyped = authedClient(clerkToken);
    const { data, error } = await untyped
        .from("host_profiles")
        .select("id")
        .eq("clerk_user_id", clerkUserId)
        .maybeSingle();
    if (error) {
        throw new Error(`resolveHostProfileId: ${error.message}`);
    }
    return data ? String(data.id) : null;
}
function sanitizeSearchQuery(raw) {
    return raw.slice(0, 100).replace(/[,()*%]/g, " ").replace(/\s+/g, " ").trim();
}
export async function searchSeekersForInvite(clerkToken, clerkUserId, query) {
    const safe = sanitizeSearchQuery(query);
    if (safe.length === 0) {
        return [];
    }
    const hostProfileId = await resolveHostProfileId(clerkToken, clerkUserId);
    if (!hostProfileId) {
        return [];
    }
    const pattern = `%${safe}%`;
    const untyped = authedClient(clerkToken);
    const [nameRes, bioRes] = await Promise.all([
        untyped
            .from("seeker_profiles")
            .select("id, display_name, short_bio")
            .ilike("display_name", pattern)
            .limit(20),
        untyped
            .from("seeker_profiles")
            .select("id, display_name, short_bio")
            .ilike("short_bio", pattern)
            .limit(20),
    ]);
    if (nameRes.error && bioRes.error) {
        return [];
    }
    const seen = new Set();
    const merged = [];
    for (const row of [
        ...(nameRes.data ?? []),
        ...(bioRes.data ?? []),
    ]) {
        const id = String(row.id);
        if (!seen.has(id)) {
            seen.add(id);
            merged.push(row);
        }
    }
    const data = merged.slice(0, 20);
    return data.map((raw) => {
        const r = raw;
        return {
            seekerProfileId: String(r.id),
            displayName: typeof r.display_name === "string" && r.display_name.trim().length > 0
                ? r.display_name.trim()
                : null,
            bio: typeof r.short_bio === "string" && r.short_bio.trim().length > 0
                ? r.short_bio.trim()
                : null,
        };
    });
}
export async function getHostInvites(clerkToken, clerkUserId) {
    const hostProfileId = await resolveHostProfileId(clerkToken, clerkUserId);
    if (!hostProfileId) {
        return [];
    }
    const untyped = authedClient(clerkToken);
    const { data, error } = await untyped
        .from("invites")
        .select("id, listing_id, seeker_profile_id, status, message, created_at, " +
        "listings!listing_id(title), " +
        "seeker_profiles!seeker_profile_id(display_name)")
        .eq("host_profile_id", hostProfileId)
        .order("created_at", { ascending: false });
    if (error) {
        throw new Error(`getHostInvites: ${error.message}`);
    }
    return (data ?? []).map((raw) => {
        const r = raw;
        const listing = firstOf(r.listings);
        const seeker = firstOf(r.seeker_profiles);
        return {
            id: String(r.id),
            listingId: String(r.listing_id),
            listingTitle: listing && typeof listing.title === "string" ? listing.title : "",
            seekerProfileId: String(r.seeker_profile_id),
            seekerDisplayName: seeker &&
                typeof seeker.display_name === "string" &&
                seeker.display_name.trim().length > 0
                ? seeker.display_name.trim()
                : null,
            status: typeof r.status === "string" ? r.status : "created",
            message: typeof r.message === "string" ? r.message : null,
            createdAt: typeof r.created_at === "string" ? r.created_at : "",
        };
    });
}
/** Postgres unique_violation SQLSTATE — surfaced as the already-invited case. */
const UNIQUE_VIOLATION_INVITE = "23505";
/**
 * Create a host-initiated invite. Status always starts at `created` because the
 * current invite lifecycle constraint rejects non-seeded values such as
 * `pending`.
 *
 * Ownership is validated in the server action before calling this function.
 * Deduplication: a unique violation on (listing_id, seeker_profile_id)
 * is returned as `{ ok: false, error: "already_invited" }`.
 */
export async function createInvite(clerkToken, params) {
    const untyped = authedClient(clerkToken);
    const trimmedMessage = typeof params.message === "string" && params.message.trim().length > 0
        ? params.message.trim()
        : null;
    const { data, error } = await untyped
        .from("invites")
        .insert({
        listing_id: params.listingId,
        host_profile_id: params.hostProfileId,
        seeker_profile_id: params.seekerProfileId,
        status: "created",
        ...(params.invitedByUserId ? { invited_by_user_id: params.invitedByUserId } : {}),
        ...(trimmedMessage !== null ? { message: trimmedMessage } : {}),
    })
        .select("id")
        .single();
    if (error) {
        if (error.code === UNIQUE_VIOLATION_INVITE) {
            return { ok: false, error: "already_invited" };
        }
        return { ok: false, error: error.message };
    }
    return { ok: true, inviteId: String(data.id) };
}
