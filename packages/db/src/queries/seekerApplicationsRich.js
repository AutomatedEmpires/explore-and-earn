import "server-only";
import { authedClient } from "../client";
/*
 * Seeker self-service dashboard data (Agent 2 / PR 2).
 *
 * This module is intentionally separate from the large queries/applications.ts
 * so we add NEW capabilities without editing or risking the existing seeker /
 * host query surface. It re-derives a couple of small private helpers (profile
 * resolution, row -> listing view-model) rather than exporting internals from
 * applications.ts, keeping that file's public signatures untouched.
 */
/** Resolve seeker_profiles.id for the authed Clerk user. */
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
        const fmt = (cents) => new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 0,
        }).format(cents / 100);
        const min = fmt(minCents);
        const maxCents = typeof row.compensation_max_cents === "number"
            ? row.compensation_max_cents
            : null;
        const max = maxCents != null ? fmt(maxCents) : null;
        const range = max && max !== min ? `${min}–${max}` : min;
        return unit === "other" || unit === "exchange" || unit === "stipend"
            ? range
            : `${range}/${unit}`;
    }
    return "Negotiable";
}
function isVerifiedAttestation(value) {
    return value === "attested";
}
function rowToSeekerApplicationListing(value) {
    const row = firstOf(value);
    if (!row)
        return null;
    const hostRaw = firstOf(row.host_profiles);
    const hostName = hostRaw &&
        typeof hostRaw.company_name === "string" &&
        hostRaw.company_name.length > 0
        ? hostRaw.company_name
        : "Unknown Host";
    const verified = hostRaw
        ? isVerifiedAttestation(hostRaw.attestation_status)
        : false;
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
        opportunityWindow: typeof row.timeline_summary === "string" &&
            row.timeline_summary.length > 0
            ? row.timeline_summary
            : "Open",
        status: (typeof row.status === "string"
            ? row.status
            : "live"),
        host: { name: hostName, verified },
        benefits,
        coverImageUrl: typeof row.cover_photo_url === "string" ? row.cover_photo_url : null,
    };
}
const RICH_SEEKER_APPLICATION_SELECT = "id, listing_id, status, cover_message, submitted_at, reviewed_at, " +
    "decided_at, listings!listing_id(id, title, category, location_display, " +
    "status, housing_included, meals_included, compensation_summary, " +
    "compensation_min_cents, compensation_max_cents, compensation_unit, " +
    "compensation_currency, timeline_summary, cover_photo_url, " +
    "host_profiles(company_name, attestation_status))";
/**
 * All applications for the authed seeker, newest first, joined to listing +
 * host, including reviewed_at / decided_at for the status timeline.
 */
export async function getSeekerApplicationsRich(clerkToken, clerkUserId) {
    const seekerProfileId = await resolveSeekerProfileId(clerkToken, clerkUserId);
    if (!seekerProfileId)
        return [];
    const untyped = authedClient(clerkToken);
    const { data, error } = await untyped
        .from("applications")
        .select(RICH_SEEKER_APPLICATION_SELECT)
        .eq("seeker_profile_id", seekerProfileId)
        .order("submitted_at", { ascending: false });
    if (error) {
        throw new Error(`getSeekerApplicationsRich: ${error.message}`);
    }
    return (data ?? []).map((raw) => {
        const r = raw;
        return {
            id: String(r.id),
            listingId: String(r.listing_id),
            status: typeof r.status === "string" ? r.status : "applied",
            submittedAt: typeof r.submitted_at === "string" ? r.submitted_at : "",
            reviewedAt: typeof r.reviewed_at === "string" ? r.reviewed_at : null,
            decidedAt: typeof r.decided_at === "string" ? r.decided_at : null,
            coverMessage: typeof r.cover_message === "string" ? r.cover_message : null,
            listing: rowToSeekerApplicationListing(r.listings),
        };
    });
}
/**
 * Withdraw the authed seeker's own application.
 *
 * App-level guards (RLS is gated to a separate change):
 * - profile_not_found — no seeker_profiles row
 * - not_found         — application id does not exist (or not visible)
 * - forbidden         — application belongs to a different seeker
 * - invalid_status    — only an `applied` application may be withdrawn
 *
 * applied -> withdrawn is a permitted lifecycle transition, so the DB-side
 * lifecycle trigger accepts the update.
 */
export async function withdrawApplication(clerkToken, clerkUserId, applicationId) {
    const seekerProfileId = await resolveSeekerProfileId(clerkToken, clerkUserId);
    if (!seekerProfileId) {
        return { ok: false, error: "profile_not_found" };
    }
    const untyped = authedClient(clerkToken);
    const { data: appRow, error: appError } = await untyped
        .from("applications")
        .select("id, seeker_profile_id, status")
        .eq("id", applicationId)
        .maybeSingle();
    if (appError) {
        return { ok: false, error: appError.message };
    }
    if (!appRow) {
        return { ok: false, error: "not_found" };
    }
    const row = appRow;
    if (String(row.seeker_profile_id) !== seekerProfileId) {
        return { ok: false, error: "forbidden" };
    }
    if (row.status !== "applied") {
        return { ok: false, error: "invalid_status" };
    }
    const { error: updateError } = await untyped
        .from("applications")
        .update({ status: "withdrawn", withdrawn_reason: "seeker_withdrew" })
        .eq("id", applicationId)
        .eq("seeker_profile_id", seekerProfileId);
    if (updateError) {
        return { ok: false, error: updateError.message };
    }
    return { ok: true };
}
