import "server-only";
import { authedClient } from "../client";
const ALLOWED_REASONS = new Set([
    "unsafe",
    "inaccurate",
    "scam",
    "inappropriate",
    "housing_pay",
    "other",
]);
/**
 * Insert a new listing report on behalf of the authenticated user.
 *
 * @param clerkToken  Supabase-template Clerk JWT for the authed client.
 * @param input       Validated insert input (reporterId from server-side auth).
 * @returns `{ ok: true, report }` on success, `{ ok: false, error }` on failure.
 */
export async function insertReport(clerkToken, input) {
    const { reporterId, listingId, reason, detail } = input;
    if (!reporterId) {
        return { ok: false, error: "Reporter ID is required." };
    }
    if (!listingId) {
        return { ok: false, error: "Listing ID is required." };
    }
    if (!ALLOWED_REASONS.has(reason)) {
        return { ok: false, error: "Invalid report reason." };
    }
    const db = authedClient(clerkToken);
    const trimmedDetail = detail?.trim() || null;
    const { data, error } = await db
        .from("reports")
        .insert({
        reporter_id: reporterId,
        listing_id: listingId,
        reason,
        detail: trimmedDetail,
        status: "submitted",
    })
        .select("id, reporter_id, listing_id, reason, detail, status, created_at")
        .single();
    if (error || !data) {
        return {
            ok: false,
            error: error?.message ?? "Could not submit the report.",
        };
    }
    const row = data;
    return {
        ok: true,
        report: {
            id: String(row.id),
            reporterId: String(row.reporter_id),
            listingId: String(row.listing_id),
            reason: row.reason,
            detail: typeof row.detail === "string" ? row.detail : null,
            status: row.status,
            createdAt: String(row.created_at),
        },
    };
}
