import Link from "next/link";
import { Icon, Meter } from "@explore-and-earn/ui";

import type {
  HostAnalytics,
  HostDashboardStats,
  RecentActivity,
} from "@explore-and-earn/db";
import styles from "./HostDashboard.module.css";
import { StaggerReveal } from "./StaggerReveal";

export interface HostDashboardProps {
  readonly stats: HostDashboardStats;
  readonly recentActivity: readonly RecentActivity[];
  /** Company name for the greeting. */
  readonly companyName: string | null;
  /** Host's primary marketplace lane (farm/maritime/remote/seasonal/mix) — drives the hero atmosphere. */
  readonly primaryLane: string | null;
  /** Full host analytics for the performance cards. */
  readonly analytics: HostAnalytics;
}

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
 * Host dashboard — a premium marketplace command center composed from live
 * analytics data. Uses the global host-* design-system layer (host.css).
 * No data is fabricated; panels conditionally render on the data that exists.
 */
export function HostDashboard({
  stats,
  recentActivity,
  companyName,
  primaryLane,
  analytics,
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

  // Analytics-derived figures for the performance cards.
  const acceptancePct = Math.round(analytics.inviteAcceptanceRate * 100);
  const totalApplicationsAllTime = Object.values(
    analytics.totalApplicationsByStatus,
  ).reduce((sum, n) => sum + n, 0);
  const topListings = analytics.perListingStats.slice(0, 5);

  const pending = stats.pendingActions;
  const isNewHost = totalListings === 0;
  // Exactly one KPI leads as the dominant tile — the host's most urgent job
  // (pending review > new applicants). Avoids two competing "primary" tiles.
  const leadKpi: "pending" | "new" | null =
    pending > 0 ? "pending" : newApps > 0 ? "new" : null;
  // The single strongest next action drives the hero CTA.
  const heroPrimary =
    pending > 0
      ? { href: "/host/applicants", label: `Review ${pending} applicant${pending === 1 ? "" : "s"}`, icon: "action.apply" as const }
      : { href: "/host/listings/new", label: "Create a listing", icon: "status.open" as const };

  return (
    <StaggerReveal className={`host-page ${styles.dashboard}`}>
      {/* ── Identity hero + strongest next action ──────────────────── */}
      <section className="host-hero" data-lane={primaryLane ?? undefined}>
        <div>
          <p className="host-hero__eyebrow">Hosting command center</p>
          <h1 className="host-hero__title">
            {companyName ? `Welcome back, ${companyName}` : "Host dashboard"}
          </h1>
          <p className="host-hero__sub">
            {isNewHost
              ? "Post your first opportunity to start reaching work-travelers."
              : "Your listings, applicants, and activity at a glance."}
          </p>
        </div>
        <div className="host-hero__actions">
          <Link className="host-hero__cta" href={heroPrimary.href}>
            <Icon name={heroPrimary.icon} size={20} aria-hidden />
            {heroPrimary.label}
          </Link>
          {!isNewHost ? (
            <Link className="host-hero__cta host-hero__cta--ghost" href="/host/listings/new">
              <Icon name="action.forward" size={20} aria-hidden />
              New listing
            </Link>
          ) : null}
        </div>
      </section>

      {/* ── KPI row ─────────────────────────────────────────────────── */}
      <div className="host-kpiGrid">
        <Link className="host-kpi" href="/host/listings">
          <span className="host-kpi__top">
            <Icon name="status.open" size={16} aria-hidden />
          </span>
          <span className="host-kpi__value">{liveCount}</span>
          <span className="host-kpi__label">Live listings</span>
        </Link>
        <Link
          className={`host-kpi${leadKpi === "new" ? " host-kpi--primary" : ""}`}
          href="/host/applicants"
        >
          <span className="host-kpi__top">
            <Icon name="action.apply" size={16} aria-hidden />
          </span>
          <span className="host-kpi__value">{newApps}</span>
          <span className="host-kpi__label">New applicants</span>
        </Link>
        <Link
          className={`host-kpi${leadKpi === "pending" ? " host-kpi--primary" : ""}`}
          href="/host/applicants"
        >
          <span className="host-kpi__top">
            <Icon name="status.match" size={16} aria-hidden />
          </span>
          <span className="host-kpi__value">{pending}</span>
          <span className="host-kpi__label">Pending review</span>
        </Link>
        <Link className="host-kpi" href="/host/applicants">
          <span className="host-kpi__top">
            <Icon name="analytics.meter" size={16} aria-hidden />
          </span>
          <span className="host-kpi__value">{totalAppsMonth}</span>
          <span className="host-kpi__label">Apps this month</span>
        </Link>
      </div>

      {/* ── Needs attention ─────────────────────────────────────────── */}
      <section className="host-panel host-panel--raised">
        <div className="host-panel__head">
          <div className="host-panel__titles">
            <span className="host-panel__eyebrow">Needs attention</span>
            <h2 className="host-panel__title">What to do next</h2>
          </div>
        </div>
        <div className={styles.attentionList}>
          {pending > 0 ? (
            <Link className="host-attention" href="/host/applicants">
              <span className="host-attention__count">{pending}</span>
              <span className="host-attention__text">
                <span className="host-attention__title">Applicants awaiting review</span>
                <span className="host-attention__sub">Respond quickly to win great seekers</span>
              </span>
              <Icon name="action.forward" size={20} aria-hidden />
            </Link>
          ) : null}
          {newApps > 0 ? (
            <Link className="host-attention" href="/host/applicants">
              <span className="host-attention__count">{newApps}</span>
              <span className="host-attention__text">
                <span className="host-attention__title">New applications this month</span>
                <span className="host-attention__sub">Fresh interest in your listings</span>
              </span>
              <Icon name="action.forward" size={20} aria-hidden />
            </Link>
          ) : null}
          {draftCount > 0 ? (
            <Link className="host-attention" href="/host/listings">
              <span className="host-attention__count">{draftCount}</span>
              <span className="host-attention__text">
                <span className="host-attention__title">Draft listings to publish</span>
                <span className="host-attention__sub">Publish to start receiving applicants</span>
              </span>
              <Icon name="action.forward" size={20} aria-hidden />
            </Link>
          ) : null}
          {pending === 0 && newApps === 0 && draftCount === 0 ? (
            <p className={styles.allClear}>
              <Icon name="system.success" size={20} aria-hidden />
              You&rsquo;re all caught up.
            </p>
          ) : null}
        </div>
      </section>

      {/* ── Quick actions ───────────────────────────────────────────── */}
      <section>
        <div className="host-actionGrid">
          <Link className="host-action-tile host-action-tile--primary" href="/host/listings/new">
            <span className="host-action-tile__icon"><Icon name="action.apply" size={20} aria-hidden /></span>
            <span className="host-action-tile__label">Create listing</span>
            <span className="host-action-tile__chev"><Icon name="action.forward" size={20} aria-hidden /></span>
          </Link>
          <Link className="host-action-tile" href="/host/applicants">
            <span className="host-action-tile__icon"><Icon name="status.match" size={20} aria-hidden /></span>
            <span className="host-action-tile__label">Review applicants</span>
            <span className="host-action-tile__chev"><Icon name="action.forward" size={20} aria-hidden /></span>
          </Link>
          <Link className="host-action-tile" href="/host/listings">
            <span className="host-action-tile__icon"><Icon name="status.boosted" size={20} aria-hidden /></span>
            <span className="host-action-tile__label">Boost a listing</span>
            <span className="host-action-tile__chev"><Icon name="action.forward" size={20} aria-hidden /></span>
          </Link>
          <Link className="host-action-tile" href="/host/messages">
            <span className="host-action-tile__icon"><Icon name="nav.messages" size={20} aria-hidden /></span>
            <span className="host-action-tile__label">Messages</span>
            <span className="host-action-tile__chev"><Icon name="action.forward" size={20} aria-hidden /></span>
          </Link>
          <Link className="host-action-tile" href="/host/profile/edit">
            <span className="host-action-tile__icon"><Icon name="nav.profile" size={20} aria-hidden /></span>
            <span className="host-action-tile__label">Edit profile</span>
            <span className="host-action-tile__chev"><Icon name="action.forward" size={20} aria-hidden /></span>
          </Link>
          <Link className="host-action-tile" href="/host/billing">
            <span className="host-action-tile__icon"><Icon name="system.info" size={20} aria-hidden /></span>
            <span className="host-action-tile__label">Plan &amp; billing</span>
            <span className="host-action-tile__chev"><Icon name="action.forward" size={20} aria-hidden /></span>
          </Link>
        </div>
      </section>

      {/* ── Pipeline + invite performance (2-col on desktop) ────────── */}
      <div className={styles.twoCol}>
        <section className="host-panel host-panel--raised">
          <div className="host-panel__head">
            <div className="host-panel__titles">
              <span className="host-panel__eyebrow">This month</span>
              <h2 className="host-panel__title">Application pipeline</h2>
            </div>
            <Link className="host-panel__action" href="/host/applicants">
              View pipeline
              <Icon name="action.forward" size={16} aria-hidden />
            </Link>
          </div>
          {totalAppsMonth > 0 ? (
            <>
              <div className={styles.meterRow}>
                <Meter value={pipelineFill} label="REVIEWED" />
                <span className={styles.meterLabel}>
                  {reviewed} of {totalAppsMonth} reviewed
                </span>
              </div>
            </>
          ) : (
            <p className={styles.muted}>No applications yet this month.</p>
          )}
        </section>

        <section className="host-panel host-panel--raised">
          <div className="host-panel__head">
            <div className="host-panel__titles">
              <span className="host-panel__eyebrow">Reach</span>
              <h2 className="host-panel__title">Invite performance</h2>
            </div>
          </div>
          <dl className="host-statList">
            <div className="host-stat">
              <dt className="host-stat__label">Active listings</dt>
              <dd className="host-stat__value">{analytics.activeListingCount}</dd>
            </div>
            <div className="host-stat">
              <dt className="host-stat__label">Total applications</dt>
              <dd className="host-stat__value">{totalApplicationsAllTime}</dd>
            </div>
            <div className="host-stat">
              <dt className="host-stat__label">Invite acceptance</dt>
              <dd className="host-stat__value">{acceptancePct}%</dd>
            </div>
          </dl>
        </section>
      </div>

      {/* ── Per-listing performance ─────────────────────────────────── */}
      {topListings.length > 0 ? (
        <section className="host-panel host-panel--raised">
          <div className="host-panel__head">
            <div className="host-panel__titles">
              <span className="host-panel__eyebrow">Performance</span>
              <h2 className="host-panel__title">Top listings</h2>
            </div>
            <Link className="host-panel__action" href="/host/analytics">
              Analytics
              <Icon name="action.forward" size={16} aria-hidden />
            </Link>
          </div>
          <ul className={styles.listingStatsList}>
            {topListings.map((listing) => (
              <li key={listing.listingId} className={styles.listingStatsItem}>
                <div className={styles.listingStatsTitle}>{listing.listingTitle}</div>
                <div className={styles.listingStatsMeta}>
                  <span className={styles.listingStatsMetric}>{listing.totalApplications} applications</span>
                  <span className={styles.listingStatsMetric}>{listing.invitesSent} invites</span>
                  <span className={styles.listingStatsMetric}>{listing.invitesAccepted} accepted</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ── Recent activity ─────────────────────────────────────────── */}
      {recentActivity.length > 0 ? (
        <section className="host-panel host-panel--raised">
          <div className="host-panel__head">
            <div className="host-panel__titles">
              <span className="host-panel__eyebrow">Activity</span>
              <h2 className="host-panel__title">Recent activity</h2>
            </div>
          </div>
          <ol className={styles.activityList}>
            {recentActivity.map((item) => (
              <li key={item.id} className={styles.activityItem}>
                <span className={styles.activityIcon}>
                  <Icon
                    name={
                      ACTIVITY_ICON[item.type] as Parameters<typeof Icon>[0]["name"]
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
        </section>
      ) : null}
    </StaggerReveal>
  );
}
