"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, type BadgeProps, Button, Icon, type IconKey, MetricCard, MetricGrid } from "@explore-and-earn/ui";

import {
  takeModerationActionAction,
  type ModerationActionInput,
} from "../../app/actions/moderation";
import { formatAdminDate, humanizeToken } from "./status";
import styles from "./ModerationWorkbench.module.css";

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

/** One report row, shaped by getReportsQueue (real fields only). */
export interface ModerationReportRowView {
  readonly id: string;
  readonly listingId: string;
  readonly listingTitle: string;
  readonly hostCompanyName: string | null;
  readonly reason: string;
  readonly detail: string | null;
  readonly status: string;
  readonly reporterRef: string;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
  readonly actionCount: number;
}

/** Workbench stat counts from getModerationStats. */
export interface ModerationStatsView {
  readonly open: number;
  readonly reviewing: number;
  readonly resolved: number;
  readonly dismissed: number;
  readonly actionsTaken: number;
}

type StatusLane = "all" | "open" | "reviewing" | "resolved" | "dismissed";

/** Statuses that mean a report is still actionable / mid-review. */
const OPEN_STATUSES = new Set(["submitted", "triaged"]);
const REVIEWING_STATUSES = new Set(["under_review"]);

/**
 * Coarse lane a report falls into. action_taken/closed fall through to
 * "resolved"; dismissed is its own terminal lane. Mirrors the db-side
 * vocabulary in getReportsQueue so the client filter and the stat counts agree.
 */
function laneOf(status: string): StatusLane {
  if (OPEN_STATUSES.has(status)) return "open";
  if (REVIEWING_STATUSES.has(status)) return "reviewing";
  if (status === "dismissed") return "dismissed";
  return "resolved";
}

/** A report is still live (un-terminal) when it sits in the open/reviewing lanes. */
function isLive(status: string): boolean {
  return OPEN_STATUSES.has(status) || REVIEWING_STATUSES.has(status);
}

/**
 * Honest severity tier from the REAL report reason only — no fabricated score.
 * Unsafe/scam are the highest-impact flags; the tier tones the card edge and
 * sorts attention. Mirrors the trust-gradient pattern in AdminHostsTable.
 */
type Severity = "critical" | "elevated" | "routine";

function severityOf(reason: string): Severity {
  if (reason === "unsafe" || reason === "scam") return "critical";
  if (reason === "housing_pay" || reason === "inappropriate" || reason === "spam") return "elevated";
  return "routine";
}

/** Human label for a report reason token. */
function reasonLabel(reason: string): string {
  switch (reason) {
    case "housing_pay":
      return "Housing / pay dispute";
    case "unsafe":
      return "Unsafe";
    case "scam":
      return "Scam / fraud";
    case "spam":
      return "Spam";
    case "inaccurate":
      return "Inaccurate";
    case "inappropriate":
      return "Inappropriate";
    default:
      return "Other";
  }
}

/** Map a report status to a Badge variant. */
function statusVariant(status: string): BadgeVariant {
  if (status === "action_taken" || status === "closed") return "success";
  if (status === "dismissed") return "neutral";
  if (status === "under_review") return "featured";
  return "info";
}

/** Map a report status to a registry icon key. */
function statusIcon(status: string): IconKey {
  if (status === "action_taken" || status === "closed") return "status.accepted";
  if (status === "dismissed") return "status.declined";
  if (status === "under_review") return "status.featured";
  if (status === "triaged") return "status.draft";
  return "status.open";
}

/** A short, human "age" string from an ISO timestamp (queue triage signal). */
function reportAge(iso: string): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/** The four moderator decisions, each wired to one server-action `action` token. */
const DECISIONS: ReadonlyArray<{
  readonly action: ModerationActionInput["action"];
  readonly label: string;
  readonly icon: IconKey;
  readonly variant: "primary" | "secondary" | "ghost";
  readonly tone: "danger" | "warn" | "neutral";
}> = [
  { action: "dismissed", label: "Dismiss", icon: "action.close", variant: "ghost", tone: "neutral" },
  { action: "warned", label: "Warn host", icon: "system.warning", variant: "secondary", tone: "warn" },
  { action: "content_removed", label: "Remove content", icon: "action.delete", variant: "secondary", tone: "warn" },
  { action: "suspended", label: "Suspend", icon: "system.lock", variant: "primary", tone: "danger" },
];

/**
 * Admin Moderation Workbench — the action surface that closes the report loop.
 *
 * Each card is one seeker report (real columns only: reason, detail, status,
 * derived reporter ref, listing + host). A moderator can Dismiss, Warn, Remove
 * content, or Suspend; every decision posts to takeModerationActionAction, which
 * writes the moderation_actions audit row and advances the report status. The UI
 * is optimistic-ish: the acting card shows a busy state via useTransition, then
 * router.refresh() repaints from the server so the lane counts re-settle. Raw
 * Clerk reporter ids are NEVER rendered — only the `#XXXX` ref from the query.
 */
export function ModerationWorkbench({
  reports,
  stats,
}: {
  readonly reports: ReadonlyArray<ModerationReportRowView>;
  readonly stats: ModerationStatsView;
}) {
  const router = useRouter();
  const [lane, setLane] = useState<StatusLane>("all");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function runDecision(
    report: ModerationReportRowView,
    action: ModerationActionInput["action"],
  ) {
    setError(null);
    setPendingId(report.id);
    startTransition(async () => {
      const result = await takeModerationActionAction({
        reportId: report.id,
        // Every report targets a listing (028_reports.sql FK), so the moderation
        // subject is that listing — the honest, real subject the report exposes.
        subjectType: "listing",
        subjectId: report.listingId,
        action,
      });
      setPendingId(null);
      if (!result.ok) {
        setError(
          result.error === "forbidden"
            ? "You are not authorized to take this action."
            : result.error ?? "Something went wrong.",
        );
      } else {
        router.refresh();
      }
    });
  }

  const total = reports.length;
  const liveCount = useMemo(
    () => reports.filter((r) => isLive(r.status)).length,
    [reports],
  );

  const segments: ReadonlyArray<{
    readonly key: StatusLane;
    readonly label: string;
    readonly count: number;
  }> = [
    { key: "all", label: "All", count: total },
    { key: "open", label: "Open", count: stats.open },
    { key: "reviewing", label: "Reviewing", count: stats.reviewing },
    { key: "resolved", label: "Resolved", count: stats.resolved },
    { key: "dismissed", label: "Dismissed", count: stats.dismissed },
  ];

  const visible = useMemo(() => {
    if (lane === "all") return reports;
    return reports.filter((r) => laneOf(r.status) === lane);
  }, [reports, lane]);

  return (
    <div className={styles.wrap}>
      <MetricGrid className={styles.metrics}>
        <MetricCard
          label="Open reports"
          value={stats.open}
          trend={stats.open > 0 ? "Needs triage" : "Clear"}
          trendTone={stats.open > 0 ? "down" : "up"}
        />
        <MetricCard
          label="Under review"
          value={stats.reviewing}
          trend={stats.reviewing > 0 ? "In progress" : "None"}
          trendTone="neutral"
        />
        <MetricCard
          label="Resolved"
          value={stats.resolved}
          trend="Action taken"
          trendTone="up"
        />
        <MetricCard
          label="Actions logged"
          value={stats.actionsTaken}
          trend="Audit trail"
          trendTone="neutral"
        />
      </MetricGrid>

      {total > 0 ? (
        <div
          className={styles.toolbar}
          role="group"
          aria-label="Filter reports by status"
        >
          <span className={styles.toolbarIcon} aria-hidden="true">
            <Icon name="action.filter" size={16} />
          </span>
          <div className={styles.segments}>
            {segments.map((seg) => (
              <button
                key={seg.key}
                type="button"
                className={`${styles.segment} ${lane === seg.key ? styles.segmentActive : ""}`.trim()}
                aria-pressed={lane === seg.key}
                onClick={() => setLane(seg.key)}
              >
                <span className={styles.segmentLabel}>{seg.label}</span>
                <span className={styles.segmentCount}>{seg.count}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <p className={styles.error} role="alert">
          <Icon aria-hidden name="system.error" size={16} className={styles.errorIcon} />
          {error}
        </p>
      ) : null}

      {total === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>
            <Icon aria-hidden name="system.success" size={24} />
          </span>
          <h3 className={styles.emptyTitle}>No reports to moderate</h3>
          <p className={styles.emptySub}>
            When a seeker flags a listing it lands here for review. A clear queue
            means the marketplace is healthy.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>
            <Icon aria-hidden name="system.success" size={24} />
          </span>
          <h3 className={styles.emptyTitle}>Nothing in this lane</h3>
          <p className={styles.emptySub}>
            No reports match the <strong>{humanizeToken(lane)}</strong> filter.
            Widen the view to see the rest of the queue.
          </p>
          <Button variant="secondary" icon="action.close" onClick={() => setLane("all")}>
            Clear filter
          </Button>
        </div>
      ) : (
        <>
          <p className={styles.resultLine} role="status" aria-live="polite">
            {lane === "all" ? (
              <>
                <strong>{total}</strong> reports · {liveCount} awaiting action
              </>
            ) : (
              <>
                Showing <strong>{visible.length}</strong> of {total}
              </>
            )}
          </p>

          <div className={styles.grid} role="list">
            {visible.map((report) => {
              const busy = isPending && pendingId === report.id;
              const severity = severityOf(report.reason);
              const live = isLive(report.status);
              return (
                <article
                  key={report.id}
                  role="listitem"
                  className={`${styles.card} ${styles[`sev_${severity}`]}`}
                  data-severity={severity}
                  data-resolved={live ? undefined : "true"}
                >
                  <span className={styles.sevEdge} aria-hidden="true" />

                  <div className={styles.cardHead}>
                    <span className={`${styles.reasonTag} ${styles[`reason_${severity}`]}`}>
                      <Icon
                        aria-hidden
                        name="action.report"
                        size={16}
                        className={styles.reasonIcon}
                      />
                      {reasonLabel(report.reason)}
                    </span>
                    <Badge
                      label={humanizeToken(report.status)}
                      variant={statusVariant(report.status)}
                      icon={statusIcon(report.status)}
                    />
                  </div>

                  <div className={styles.subject}>
                    <Link
                      href={`/listings/${report.listingId}`}
                      className={styles.subjectLink}
                    >
                      <span className={styles.subjectIcon} aria-hidden="true">
                        <Icon name="category.mix" size={20} />
                      </span>
                      <span className={styles.subjectText}>
                        <span className={styles.subjectTitle}>
                          {report.listingTitle}
                        </span>
                        <span className={styles.subjectMeta}>
                          {report.hostCompanyName ?? "Unknown host"}
                          <span className={styles.metaDot} aria-hidden="true" />
                          Reporter {report.reporterRef}
                        </span>
                      </span>
                      <span className={styles.subjectGo} aria-hidden="true">
                        <Icon name="action.view" size={16} />
                      </span>
                    </Link>
                  </div>

                  {report.detail ? (
                    <p className={styles.detail}>“{report.detail}”</p>
                  ) : (
                    <p className={styles.detailEmpty}>No additional detail provided.</p>
                  )}

                  <div className={styles.cardFootMeta}>
                    <span className={styles.age}>
                      <Icon name="status.begins" size={16} aria-hidden />
                      <span>{reportAge(report.createdAt)}</span>
                      <span className={styles.date}>
                        {formatAdminDate(report.createdAt)}
                      </span>
                    </span>
                    {report.actionCount > 0 ? (
                      <span className={styles.actionCount}>
                        <Icon name="status.accepted" size={16} aria-hidden />
                        {report.actionCount === 1
                          ? "1 action logged"
                          : `${report.actionCount} actions logged`}
                      </span>
                    ) : null}
                  </div>

                  {live ? (
                    <div className={styles.actions}>
                      {DECISIONS.map((d) => (
                        <Button
                          key={d.action}
                          variant={d.variant}
                          icon={d.icon}
                          disabled={busy}
                          data-tone={d.tone}
                          aria-label={`${d.label} — report on ${report.listingTitle}`}
                          onClick={() => runDecision(report, d.action)}
                        >
                          {d.label}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.resolvedFoot}>
                      <Icon
                        aria-hidden
                        name="status.accepted"
                        size={16}
                        className={styles.resolvedIcon}
                      />
                      <span>
                        Resolved · {humanizeToken(report.status)}
                        {report.resolvedAt
                          ? ` ${formatAdminDate(report.resolvedAt)}`
                          : ""}
                      </span>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
