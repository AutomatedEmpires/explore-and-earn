import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { adminClient } from "../adminClient";

/**
 * Moderation workbench queries — the action layer behind the seeker reports
 * persisted in 028_reports.sql and the moderation_actions audit trail added in
 * 044_moderation_actions.sql.
 *
 * Like queries/admin.ts, everything here runs through the SERVICE-ROLE client so
 * a moderator sees EVERY report and can write the admin-only moderation_actions
 * table (both `reports` and `moderation_actions` deny non-service roles via RLS).
 * The service-role token is an explicit input so the secret stays an obvious,
 * auditable argument.
 *
 * Reads go through an UNTYPED client handle (the same `as unknown as
 * SupabaseClient` bridge used by savedSearches/hostReviews) because the committed
 * types.gen.ts predates `moderation_actions` and the `reports` resolution stamps.
 */

function untypedAdmin(serviceRoleToken: string): SupabaseClient {
  return adminClient(serviceRoleToken) as unknown as SupabaseClient;
}

function firstOf(value: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === "object"
    ? (candidate as Record<string, unknown>)
    : null;
}

/** Report reason vocabulary (mirrors the CHECK in 028_reports.sql). */
export type ModerationReportReason =
  | "unsafe"
  | "inaccurate"
  | "scam"
  | "inappropriate"
  | "housing_pay"
  | "other";

/** Report status workflow (mirrors the CHECK in 028_reports.sql). */
export type ModerationReportStatus =
  | "submitted"
  | "triaged"
  | "under_review"
  | "action_taken"
  | "dismissed"
  | "closed";

/** Subjects a moderation action can target (mirrors 044 CHECK). */
export type ModerationSubjectType =
  | "listing"
  | "host"
  | "seeker"
  | "message"
  | "photo"
  | "announcement";

/** Actions a moderator can record (mirrors 044 CHECK). */
export type ModerationActionKind =
  | "dismissed"
  | "warned"
  | "content_removed"
  | "suspended"
  | "reinstated";

/** Coarse triage lane the workbench filters by. */
export type ModerationQueueFilter =
  | "all"
  | "open"
  | "reviewing"
  | "resolved"
  | "dismissed";

/**
 * One report shaped for the moderation workbench. Carries ONLY real columns plus
 * a derived short reporter reference (`#XXXX`) — the raw Clerk id is never
 * surfaced, mirroring the hostRef/applicantIdentity pattern in the admin tables.
 */
export interface ModerationReportRow {
  readonly id: string;
  readonly listingId: string;
  readonly listingTitle: string;
  readonly hostCompanyName: string | null;
  readonly reason: ModerationReportReason;
  readonly detail: string | null;
  readonly status: ModerationReportStatus;
  readonly reporterRef: string;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
  /** How many moderation actions have already been recorded for this report. */
  readonly actionCount: number;
}

/** Marketplace-wide moderation counts for the workbench MetricGrid. */
export interface ModerationStats {
  readonly open: number;
  readonly reviewing: number;
  readonly resolved: number;
  readonly dismissed: number;
  readonly actionsTaken: number;
}

/** Input for recording a moderation decision against a subject. */
export interface TakeModerationActionInput {
  /** Originating report, when the action resolves a filed report (nullable). */
  readonly reportId?: string | null;
  readonly subjectType: ModerationSubjectType;
  readonly subjectId: string;
  readonly action: ModerationActionKind;
  /** Acting moderator's Clerk user id — from auth().userId, never the client. */
  readonly moderatorClerkUserId: string;
  readonly rationale?: string | null;
}

/**
 * Statuses that count as still-actionable ("open") vs. mid-review ("reviewing").
 * Resolution-terminal statuses (action_taken/dismissed/closed) drop out of the
 * live queue. Kept as sets so the filter and the stats agree on one vocabulary.
 */
const OPEN_STATUSES = new Set<ModerationReportStatus>(["submitted", "triaged"]);
const REVIEWING_STATUSES = new Set<ModerationReportStatus>(["under_review"]);
const RESOLVED_STATUSES = new Set<ModerationReportStatus>([
  "action_taken",
  "closed",
]);

/**
 * Derive a stable, human reference from a Clerk user id WITHOUT exposing the raw
 * id. Surfaces only the last 4 alphanumerics as `#XXXX` so a moderator can
 * correlate a reporter across tools. Mirrors hostRef in AdminHostsTable.
 */
function reporterRef(clerkId: string): string {
  const tail = clerkId.replace(/[^a-zA-Z0-9]/g, "").slice(-4).toUpperCase();
  return tail ? `#${tail}` : "—";
}

/** Severity weight from the (real) report reason — higher sorts first. */
function reasonWeight(reason: string): number {
  switch (reason) {
    case "unsafe":
      return 50;
    case "scam":
      return 40;
    case "housing_pay":
      return 30;
    case "inappropriate":
      return 20;
    case "inaccurate":
      return 10;
    default:
      return 5;
  }
}

const REPORT_SELECT =
  "id, listing_id, reporter_id, reason, detail, status, created_at, " +
  "resolved_at, listings!listing_id(title, host_profiles!host_profile_id(company_name))";

/**
 * Reports for the moderation queue. Sorted by IMPACT — unresolved first, then by
 * reason severity, then newest — so a moderator sees what needs action now
 * without hunting. The optional `filter` narrows to a coarse lane; the
 * `actionCount` per report is tallied in JS from a single moderation_actions
 * scan (the admin set is small enough that one pass beats N count queries).
 */
export async function getReportsQueue(
  serviceRoleToken: string,
  filter: ModerationQueueFilter = "all",
): Promise<ModerationReportRow[]> {
  const db = untypedAdmin(serviceRoleToken);

  const { data, error } = await db
    .from("reports")
    .select(REPORT_SELECT)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(`getReportsQueue: ${error.message}`);
  }

  // One pass over the audit table → action count per report.
  const { data: actionRows, error: actionError } = await db
    .from("moderation_actions")
    .select("report_id");
  if (actionError) {
    throw new Error(`getReportsQueue(actions): ${actionError.message}`);
  }
  const actionCountByReport = new Map<string, number>();
  for (const raw of actionRows ?? []) {
    const rid = (raw as unknown as Record<string, unknown>).report_id;
    if (typeof rid === "string") {
      actionCountByReport.set(rid, (actionCountByReport.get(rid) ?? 0) + 1);
    }
  }

  const rows = (data ?? []).map((raw) => {
    const r = raw as unknown as Record<string, unknown>;
    const listing = firstOf(r.listings);
    const host = listing ? firstOf(listing.host_profiles) : null;
    const id = String(r.id);
    return {
      id,
      listingId: typeof r.listing_id === "string" ? r.listing_id : "",
      listingTitle:
        listing && typeof listing.title === "string" && listing.title.length > 0
          ? listing.title
          : "Untitled listing",
      hostCompanyName:
        host && typeof host.company_name === "string"
          ? host.company_name
          : null,
      reason: (typeof r.reason === "string"
        ? r.reason
        : "other") as ModerationReportReason,
      detail: typeof r.detail === "string" ? r.detail : null,
      status: (typeof r.status === "string"
        ? r.status
        : "submitted") as ModerationReportStatus,
      reporterRef: reporterRef(
        typeof r.reporter_id === "string" ? r.reporter_id : "",
      ),
      createdAt: typeof r.created_at === "string" ? r.created_at : "",
      resolvedAt: typeof r.resolved_at === "string" ? r.resolved_at : null,
      actionCount: actionCountByReport.get(id) ?? 0,
    } satisfies ModerationReportRow;
  });

  const filtered = rows.filter((row) => {
    switch (filter) {
      case "open":
        return OPEN_STATUSES.has(row.status);
      case "reviewing":
        return REVIEWING_STATUSES.has(row.status);
      case "resolved":
        return RESOLVED_STATUSES.has(row.status);
      case "dismissed":
        return row.status === "dismissed";
      default:
        return true;
    }
  });

  // Impact sort: unresolved (open/reviewing) before resolved, then by reason
  // severity, then newest first. Stable for equal weights.
  function liveRank(status: ModerationReportStatus): number {
    if (OPEN_STATUSES.has(status)) return 2;
    if (REVIEWING_STATUSES.has(status)) return 1;
    return 0;
  }
  return filtered.sort((a, b) => {
    const live = liveRank(b.status) - liveRank(a.status);
    if (live !== 0) return live;
    const sev = reasonWeight(b.reason) - reasonWeight(a.reason);
    if (sev !== 0) return sev;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/**
 * Moderation counts for the workbench MetricGrid. `open` + `reviewing` are the
 * live queue (by report status); `resolved` covers action_taken/closed;
 * `dismissed` is its own terminal lane; `actionsTaken` is the total size of the
 * moderation_actions audit trail. All head-only exact counts — no payloads.
 */
export async function getModerationStats(
  serviceRoleToken: string,
): Promise<ModerationStats> {
  const db = untypedAdmin(serviceRoleToken);

  async function countReports(statuses: readonly string[]): Promise<number> {
    const { count, error } = await db
      .from("reports")
      .select("*", { count: "exact", head: true })
      .in("status", statuses as string[]);
    if (error) {
      throw new Error(`getModerationStats(reports): ${error.message}`);
    }
    return count ?? 0;
  }

  const [open, reviewing, resolved, dismissed, actionsResult] =
    await Promise.all([
      countReports([...OPEN_STATUSES]),
      countReports([...REVIEWING_STATUSES]),
      countReports([...RESOLVED_STATUSES]),
      countReports(["dismissed"]),
      db
        .from("moderation_actions")
        .select("*", { count: "exact", head: true }),
    ]);

  if (actionsResult.error) {
    throw new Error(`getModerationStats(actions): ${actionsResult.error.message}`);
  }

  return {
    open,
    reviewing,
    resolved,
    dismissed,
    actionsTaken: actionsResult.count ?? 0,
  };
}

/**
 * Listing status to write for a moderation decision against a `listing`
 * subject, or null when the action carries no subject mutation (dismissed —
 * no action taken; warned — a notice to the host, not a content change).
 *
 * content_removed and suspended both resolve to 'archived': the listings
 * enum (draft/under_review/live/paused/closed/archived) has no dedicated
 * "suspended" state, and inventing one is a schema change beyond what wiring
 * up an existing admin action calls for — archived already means "no longer
 * publicly visible, terminal," which both actions require. WHICH kind of
 * removal happened is preserved in moderation_actions.action, not here.
 * reinstated is the inverse: back to 'live'.
 *
 * Only `listing` is handled — it's the only subject type any admin surface
 * produces today (ModerationWorkbench hardcodes subjectType: "listing"; the
 * report schema itself only has a listing_id FK, no host/message/photo/
 * announcement report path exists yet). host/seeker/message/photo/
 * announcement stay audit-log-only until a real mutation target exists for
 * each — silently guessing at one risks writing to founder-approval-gated
 * territory (host account suspension) with no verified schema to write to.
 */
function listingUpdateFor(
  action: ModerationActionKind,
): { status: "archived" | "live"; archived_at: string | null } | null {
  const nowIso = new Date().toISOString();
  switch (action) {
    case "content_removed":
    case "suspended":
      return { status: "archived", archived_at: nowIso };
    case "reinstated":
      return { status: "live", archived_at: null };
    default:
      return null;
  }
}

/**
 * Record a moderation decision: insert one moderation_actions audit row,
 * then — when the action came from a filed report — advance that report to
 * its terminal status with resolution stamps, then — for a `listing` subject
 * with a mutating action — actually change the listing's status. Each write
 * is sequential and the audit insert is the source of truth: a later write
 * failing surfaces as not-ok (so the moderator sees it and can retry) rather
 * than silently leaving the trail and the real state inconsistent.
 *
 * Report status mapping:
 *   - dismissed                       -> 'dismissed'
 *   - warned / content_removed / suspended -> 'action_taken'
 *   - reinstated                      -> 'under_review' (re-opens for follow-up)
 */
export async function takeModerationAction(
  serviceRoleToken: string,
  input: TakeModerationActionInput,
): Promise<{ ok: boolean; error?: string }> {
  const {
    reportId,
    subjectType,
    subjectId,
    action,
    moderatorClerkUserId,
    rationale,
  } = input;

  if (!subjectId) return { ok: false, error: "Missing subject id." };
  if (!moderatorClerkUserId) {
    return { ok: false, error: "Missing moderator id." };
  }

  const db = untypedAdmin(serviceRoleToken);
  const trimmedRationale = rationale?.trim() || null;

  const { error: insertError } = await db.from("moderation_actions").insert({
    report_id: reportId ?? null,
    subject_type: subjectType,
    subject_id: subjectId,
    action,
    moderator_clerk_user_id: moderatorClerkUserId,
    rationale: trimmedRationale,
  });
  if (insertError) {
    return { ok: false, error: insertError.message };
  }

  if (reportId) {
    const nextStatus: ModerationReportStatus =
      action === "dismissed"
        ? "dismissed"
        : action === "reinstated"
          ? "under_review"
          : "action_taken";
    const isTerminal = nextStatus === "dismissed" || nextStatus === "action_taken";

    const { error: updateError } = await db
      .from("reports")
      .update({
        status: nextStatus,
        resolved_at: isTerminal ? new Date().toISOString() : null,
        resolved_by_clerk_user_id: isTerminal ? moderatorClerkUserId : null,
      })
      .eq("id", reportId);
    if (updateError) {
      return { ok: false, error: updateError.message };
    }
  }

  if (subjectType === "listing") {
    const listingUpdate = listingUpdateFor(action);
    if (listingUpdate) {
      const { data, error: listingError } = await db
        .from("listings")
        .update(listingUpdate)
        .eq("id", subjectId)
        .select("id");
      if (listingError) {
        return { ok: false, error: listingError.message };
      }
      if (!data || data.length === 0) {
        return { ok: false, error: "Listing not found." };
      }
    }
  }

  return { ok: true };
}
