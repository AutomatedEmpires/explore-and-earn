import Link from "next/link";
import { Card, Icon, Meter } from "@explore-and-earn/ui";

import type { HostDashboardStats, RecentActivity } from "@explore-and-earn/db";
import styles from "./HostDashboard.module.css";

export interface HostDashboardProps {
  readonly stats: HostDashboardStats;
  readonly recentActivity: readonly RecentActivity[];
  /** Company name for the greeting. */
  readonly companyName: string | null;
}

/** Map a DB listing status to a human-readable label. */
const LISTING_STATUS_LABEL: Record<string, string> = {
  live: "Live",
  draft: "Draft",
  paused: "Paused",
  closed: "Closed",
  archived: "Archived",
  under_review: "Under review",
};

/** Map application status to a human-readable label for the stats section. */
const APP_STATUS_LABEL: Record<string, string> = {
  applied: "New",
  reviewing: "Reviewing",
  saved_by_host: "Saved",
  offered: "Offered",
  not_selected: "Declined",
  accepted: "Accepted",
};

/** Map activity type to an icon key from the registry. */
const ACTIVITY_ICON: Record<RecentActivity["type"], string> = {
  application: "action.apply",
  invite_sent: "action.forward",
  listing_published: "status.open",
} as const;

/**
 * Format an ISO timestamp relative to now using Intl.RelativeTimeFormat.
 * Shows "just now" within 60 s, then minutes/hours/days.
 */
function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSeconds = Math.round((then - now) / 1000);
  const absSeconds = Math.abs(diffSeconds);

  if (absSeconds < 60) return "just now";

  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (absSeconds < 3600) {
    return rtf.format(Math.round(diffSeconds / 60), "minute");
  }
  if (absSeconds < 86400) {
    return rtf.format(Math.round(diffSeconds / 3600), "hour");
  }
  return rtf.format(Math.round(diffSeconds / 86400), "day");
}

/**
 * Host dashboard composed from live analytics data.
 * Uses Card primitives for stat blocks; never builds a StatCard primitive
 * (there is none in the UI package).
 */
export function HostDashboard({
  stats,
  recentActivity,
  companyName,
}: HostDashboardProps) {
  const liveCount = stats.listingsByStatus["live"] ?? 0;
  const draftCount = stats.listingsByStatus["draft"] ?? 0;
  const totalListings = Object.values(stats.listingsByStatus).reduce(
    (sum, n) => sum + n,
    0,
  );

  const newApps = stats.applicationsThisMonth["applied"] ?? 0;
  const totalAppsMonth = Object.values(stats.applicationsThisMonth).reduce(
    (sum, n) => sum + n,
    0,
  );

  // "Pipeline fill" as a 0–100 percentage for the Meter, based on how many
  // of this month's applications have moved past "applied".
  const reviewed = totalAppsMonth - newApps;
  const pipelineFill =
    totalAppsMonth > 0 ? Math.round((reviewed / totalAppsMonth) * 100) : 0;

  return (
    <div className={styles.dashboard}>
      {/* Welcome */}
      <header className={styles.welcome}>
        <h1 className={styles.welcomeHeading}>
          {companyName ? `Welcome back, ${companyName}` : "Host dashboard"}
        </h1>
        <p className={styles.welcomeSub}>
          Your hosting command centre — listings, applicants, and activity at a
          glance.
        </p>
      </header>

      {/* Stat cards grid */}
      <div className={styles.statGrid}>
        <Card title="Listings">
          <dl className={styles.statList}>
            <div className={styles.statRow}>
              <dt>
                <Icon name="status.open" size={16} aria-hidden />
                Live
              </dt>
              <dd>{liveCount}</dd>
            </div>
            <div className={styles.statRow}>
              <dt>
                <Icon name="system.info" size={16} aria-hidden />
                Draft
              </dt>
              <dd>{draftCount}</dd>
            </div>
            {Object.entries(stats.listingsByStatus)
              .filter(([s]) => s !== "live" && s !== "draft")
              .map(([status, count]) => (
                <div key={status} className={styles.statRow}>
                  <dt>{LISTING_STATUS_LABEL[status] ?? status}</dt>
                  <dd>{count}</dd>
                </div>
              ))}
            <div className={styles.statRow}>
              <dt>Total</dt>
              <dd>
                <strong>{totalListings}</strong>
              </dd>
            </div>
          </dl>
          <Link className={styles.cardLink} href="/host/listings">
            Manage listings
          </Link>
        </Card>

        <Card title="Applications this month">
          <dl className={styles.statList}>
            {Object.entries(stats.applicationsThisMonth).map(
              ([status, count]) => (
                <div key={status} className={styles.statRow}>
                  <dt>{APP_STATUS_LABEL[status] ?? status}</dt>
                  <dd>{count}</dd>
                </div>
              ),
            )}
            {totalAppsMonth === 0 ? (
              <div className={styles.statRow}>
                <dt>No applications yet this month</dt>
                <dd>—</dd>
              </div>
            ) : null}
          </dl>
          {totalAppsMonth > 0 ? (
            <div className={styles.meterRow}>
              <Meter value={pipelineFill} label="REVIEWED" />
              <span className={styles.meterLabel}>
                {reviewed} of {totalAppsMonth} reviewed this month
              </span>
            </div>
          ) : null}
          <Link className={styles.cardLink} href="/host/applicants">
            View pipeline
          </Link>
        </Card>

        <Card title="Pending actions">
          <p className={styles.pendingCount}>{stats.pendingActions}</p>
          <p className={styles.pendingLabel}>
            {stats.pendingActions === 1
              ? "item awaiting your review"
              : "items awaiting your review"}
          </p>
          {stats.pendingActions > 0 ? (
            <Link className={styles.cardLink} href="/host/applicants">
              <Icon name="action.forward" size={16} aria-hidden />
              Review now
            </Link>
          ) : (
            <p className={styles.allClear}>
              <Icon name="system.success" size={16} aria-hidden />
              All caught up!
            </p>
          )}
        </Card>
      </div>

      {/* Quick links */}
      <nav className={styles.quickLinks} aria-label="Quick links">
        <Link className={styles.quickLink} href="/host/listings">
          <Icon name="category.mix" size={20} aria-hidden />
          <span>Listings</span>
        </Link>
        <Link className={styles.quickLink} href="/host/applicants">
          <Icon name="action.apply" size={20} aria-hidden />
          <span>Applicants</span>
        </Link>
        <Link className={styles.quickLink} href="/host/invites">
          <Icon name="action.forward" size={20} aria-hidden />
          <span>Invites</span>
        </Link>
        <Link className={styles.quickLink} href="/host/messages">
          <Icon name="nav.messages" size={20} aria-hidden />
          <span>Messages</span>
        </Link>
      </nav>

      {/* Recent activity */}
      {recentActivity.length > 0 ? (
        <Card title="Recent activity">
          <ol className={styles.activityList}>
            {recentActivity.map((item) => (
              <li key={item.id} className={styles.activityItem}>
                <span className={styles.activityIcon}>
                  <Icon
                    name={
                      ACTIVITY_ICON[item.type] as Parameters<
                        typeof Icon
                      >[0]["name"]
                    }
                    size={16}
                    aria-hidden
                  />
                </span>
                <span className={styles.activityDesc}>{item.description}</span>
                <time
                  className={styles.activityTime}
                  dateTime={item.timestamp}
                  title={new Date(item.timestamp).toLocaleString()}
                >
                  {relativeTime(item.timestamp)}
                </time>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}
    </div>
  );
}
