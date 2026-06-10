import "server-only";
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
/** Allowed report reason values, mirroring the CHECK constraint in 027_reports.sql. */
export type ReportReason = "unsafe" | "inaccurate" | "scam" | "inappropriate" | "housing_pay" | "other";
/** Status values for a report, mirroring the CHECK constraint in 027_reports.sql. */
export type ReportStatus = "submitted" | "triaged" | "under_review" | "action_taken" | "dismissed" | "closed";
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
/**
 * Insert a new listing report on behalf of the authenticated user.
 *
 * @param clerkToken  Supabase-template Clerk JWT for the authed client.
 * @param input       Validated insert input (reporterId from server-side auth).
 * @returns `{ ok: true, report }` on success, `{ ok: false, error }` on failure.
 */
export declare function insertReport(clerkToken: string, input: InsertReportInput): Promise<{
    ok: true;
    report: InsertedReport;
} | {
    ok: false;
    error: string;
}>;
