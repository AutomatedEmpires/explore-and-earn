import type { HostAnalytics, HostPerListingStats } from "@explore-and-earn/db";
import { Icon } from "@explore-and-earn/ui";

import styles from "./HostAnalyticsDashboard.module.css";

export interface HostAnalyticsDashboardProps {
  readonly analytics: HostAnalytics;
  readonly subscriptionTier?: "none" | "starter" | "professional" | "enterprise";
}

const APPLICATION_STATUS_LABEL: Record<string, string> = {
  applied: "Applied",
  reviewing: "Reviewing",
  saved_by_host: "Saved",
  offered: "Offered",
  accepted: "Accepted",
  declined: "Declined",
  withdrawn: "Withdrawn",
  not_selected: "Not selected",
};

const APPLICATION_STATUS_ORDER = [
  "applied",
  "reviewing",
  "saved_by_host",
  "offered",
  "accepted",
  "declined",
  "withdrawn",
  "not_selected",
];

function formatRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function totalApplications(byStatus: Record<string, number>): number {
  return Object.values(byStatus).reduce((sum, n) => sum + n, 0);
}

function StatCard({
  label,
  value,
  icon,
  note,
}: {
  label: string;
  value: string;
  icon: React.ComponentProps<typeof Icon>["name"];
  note?: string;
}) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statCardHead}>
        <span className={styles.statCardLabel}>{label}</span>
        <span className={styles.statCardIcon}>
          <Icon name={icon} size={16} aria-hidden />
        </span>
      </div>
      <p className={styles.statCardValue}>{value}</p>
      {note ? <p className={styles.statCardNote}>{note}</p> : null}
    </div>
  );
}

function ApplicationFunnel({
  byStatus,
}: {
  byStatus: Record<string, number>;
}) {
  const total = totalApplications(byStatus);
  if (total === 0) {
    return (
      <p className={styles.emptyNote}>No applications yet.</p>
    );
  }

  const statuses = APPLICATION_STATUS_ORDER.filter((s) => byStatus[s] != null && byStatus[s] > 0);

  return (
    <div className={styles.funnel}>
      {statuses.map((status) => {
        const count = byStatus[status] ?? 0;
        const pct = total > 0 ? (count / total) * 100 : 0;
        return (
          <div key={status} className={styles.funnelRow}>
            <span className={styles.funnelLabel}>
              {APPLICATION_STATUS_LABEL[status] ?? status}
            </span>
            <div className={styles.funnelBarTrack}>
              <div
                className={styles.funnelBarFill}
                style={{ width: `${pct}%` }}
                aria-label={`${count} — ${Math.round(pct)}%`}
              />
            </div>
            <span className={styles.funnelCount}>{count}</span>
          </div>
        );
      })}
    </div>
  );
}

function ListingRow({ stat }: { stat: HostPerListingStats }) {
  const total = stat.totalApplications;
  const inviteRate =
    stat.invitesSent > 0
      ? formatRate(stat.invitesAccepted / stat.invitesSent)
      : "—";

  return (
    <tr className={styles.tableRow}>
      <td className={styles.tdTitle}>
        <span className={styles.listingTitle}>{stat.listingTitle}</span>
        <span className={`${styles.statusPip} ${styles[`pip_${stat.listingStatus}`]}`}>
          {stat.listingStatus}
        </span>
      </td>
      <td className={styles.tdNum}>{total}</td>
      <td className={styles.tdNum}>{stat.invitesSent}</td>
      <td className={styles.tdNum}>{stat.invitesAccepted}</td>
      <td className={styles.tdNum}>{inviteRate}</td>
    </tr>
  );
}

export function HostAnalyticsDashboard({
  analytics,
  subscriptionTier = "none",
}: HostAnalyticsDashboardProps) {
  const { totalApplicationsByStatus, activeListingCount, inviteAcceptanceRate, perListingStats } =
    analytics;

  const totalApps = totalApplications(totalApplicationsByStatus);
  const hasPerListingAccess = subscriptionTier !== "none";

  return (
    <div className={styles.page}>
      {/* ── Headline stats ─────────────────────────────────────────── */}
      <section className={styles.section} aria-labelledby="stats-heading">
        <h2 id="stats-heading" className={styles.sectionTitle}>
          <Icon name="analytics.meter" size={16} aria-hidden />
          Overview
        </h2>
        <div className={styles.statCards}>
          <StatCard
            label="Active listings"
            value={String(activeListingCount)}
            icon="status.open"
            note="Live on the marketplace"
          />
          <StatCard
            label="Total applications"
            value={String(totalApps)}
            icon="analytics.funnel"
            note="Across all listings"
          />
          <StatCard
            label="Invite acceptance"
            value={formatRate(inviteAcceptanceRate)}
            icon="analytics.trend"
            note="Invites accepted vs. sent"
          />
        </div>
      </section>

      {/* ── Application pipeline ───────────────────────────────────── */}
      <section className={styles.section} aria-labelledby="funnel-heading">
        <h2 id="funnel-heading" className={styles.sectionTitle}>
          <Icon name="analytics.funnel" size={16} aria-hidden />
          Application pipeline
        </h2>
        <div className={styles.card}>
          <ApplicationFunnel byStatus={totalApplicationsByStatus} />
        </div>
      </section>

      {/* ── Per-listing breakdown ──────────────────────────────────── */}
      {perListingStats.length > 0 ? (
        <section className={styles.section} aria-labelledby="listings-heading">
          <h2 id="listings-heading" className={styles.sectionTitle}>
            <Icon name="analytics.donut" size={16} aria-hidden />
            Listings breakdown
          </h2>
          <div className={styles.gatedWrap}>
            <div className={`${styles.card} ${styles.tableWrap}${!hasPerListingAccess ? ` ${styles.blurred}` : ""}`}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.thTitle}>Listing</th>
                    <th className={styles.thNum}>Apps</th>
                    <th className={styles.thNum}>Invites</th>
                    <th className={styles.thNum}>Accepted</th>
                    <th className={styles.thNum}>Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {perListingStats.map((stat) => (
                    <ListingRow key={stat.listingId} stat={stat} />
                  ))}
                </tbody>
              </table>
            </div>
            {!hasPerListingAccess ? (
              <div className={styles.gateOverlay} aria-label="Upgrade to access per-listing breakdown">
                <span className={styles.gateIcon}>
                  <Icon name="system.info" size={24} aria-hidden />
                </span>
                <p className={styles.gateTitle}>Starter plan required</p>
                <p className={styles.gateNote}>
                  Upgrade to see per-listing application counts, invite rates, and acceptance
                  data for each of your opportunities.
                </p>
                <a className={styles.gateBtn} href="/host/settings#billing">
                  View plans
                </a>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* ── Empty state ────────────────────────────────────────────── */}
      {perListingStats.length === 0 && totalApps === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>
            <Icon name="analytics.meter" size={24} aria-hidden />
          </span>
          <p className={styles.emptyTitle}>No data yet</p>
          <p className={styles.emptyNote}>
            Analytics appear once your listings are live and receiving applications.
          </p>
        </div>
      ) : null}
    </div>
  );
}
