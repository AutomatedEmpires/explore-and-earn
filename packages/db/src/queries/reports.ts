import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { authedClient } from "../client";

/**
 * Reports data access — seeker-submitted listing reports for moderation.
 *
 * SECURITY: RLS is enabled on `reports` (see 027_reports.sql). The INSERT
 * policy enforces `reporter_id = auth.jwt() ->> 'sub'`, so only the
 * authenticated reporter can write their own rows. The SELECT policy mirrors
 * this: reporters can only read their own reports; admins use the service-role
 * client (adminClient) which bypasses RLS.
 *
 * reporter_id is always auth().userId from the calling server action — it is
 * NEVER decoded from the Clerk JWT client-side.
 */

/** Allowed report reason values, mirroring the CHECK constraint in 054_host_spam_report_flagging.sql. */
export type ReportReason =
  | "unsafe"
  | "inaccurate"
  | "scam"
  | "spam"
  | "inappropriate"
  | "housing_pay"
  | "other";

/** Status values for a report, mirroring the CHECK constraint in 027_reports.sql. */
export type ReportStatus =
  | "submitted"
  | "triaged"
  | "under_review"
  | "action_taken"
  | "dismissed"
  | "closed";

/** Shape of the data returned when a report is inserted. */
export interface InsertedReport {
  readonly id: string;
  readonly reporterId: string;
  readonly listingId: string;
  readonly reason: ReportReason;
  readonly detail: string | null;
  readonly status: ReportStatus;
  readonly createdAt: string;
}

/** Input for creating a new report. */
export interface InsertReportInput {
  /** Clerk user ID of the reporter — must come from auth().userId, never from the client. */
  readonly reporterId: string;
  readonly listingId: string;
  readonly reason: ReportReason;
  /** Optional free-text elaboration (may be empty string or undefined). */
  readonly detail?: string;
}

const ALLOWED_REASONS = new Set<string>([
  "unsafe",
  "inaccurate",
  "scam",
  "spam",
  "inappropriate",
  "housing_pay",
  "other",
]);

/**
 * Insert a new listing report on behalf of the authenticated user.
 *
 * @param clerkToken  Clerk session JWT from the native Supabase integration.
 * @param input       Validated insert input (reporterId from server-side auth).
 * @returns `{ ok: true, report }` on success, `{ ok: false, error }` on failure.
 */
export async function insertReport(
  clerkToken: string,
  input: InsertReportInput,
): Promise<
  | { ok: true; report: InsertedReport }
  | { ok: false; error: string }
> {
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

  const db = authedClient(clerkToken) as unknown as SupabaseClient;

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
    .select(
      "id, reporter_id, listing_id, reason, detail, status, created_at",
    )
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "Could not submit the report.",
    };
  }

  const row = data as Record<string, unknown>;
  return {
    ok: true,
    report: {
      id: String(row.id),
      reporterId: String(row.reporter_id),
      listingId: String(row.listing_id),
      reason: row.reason as ReportReason,
      detail: typeof row.detail === "string" ? row.detail : null,
      status: row.status as ReportStatus,
      createdAt: String(row.created_at),
    },
  };
}
