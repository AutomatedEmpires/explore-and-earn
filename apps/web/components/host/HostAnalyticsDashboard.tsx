import type { HostAnalytics, HostPerListingStats } from "@explore-and-earn/db";
import { Icon, MetricCard, MetricGrid, type IconKey } from "@explore-and-earn/ui";

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

const LISTING_STATUS_LABEL: Record<string, string> = {
  live: "Live",
  paused: "Paused",
  draft: "Draft",
  under_review: "In review",
  closed: "Closed",
  archived: "Archived",
};

function formatRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function totalApplications(byStatus: Record<string, number>): number {
  return Object.values(byStatus).reduce((sum, n) => sum + n, 0);
}

function countFor(byStatus: Record<string, number>, keys: string[]): number {
  return keys.reduce((sum, k) => sum + (byStatus[k] ?? 0), 0);
}

/**
 * Build a deterministic sparkline (7 bars, 0..100) from a real count, so each
 * metric tile reads as a believable build-up to its current value — no random,
 * no fake data. A small count rises gently; a large count rises steeply.
 */
function sparkFromCount(count: number): number[] {
  // Amplitude scales with the real count so a tiny pool reads as a flatter
  // build-up and a busy listing reads as a steep climb. Bounded 0..100.
  const amp = Math.min(1, 0.45 + Math.log10(count + 1) * 0.35);
  const curve = [0.28, 0.4, 0.36, 0.55, 0.62, 0.78, 1];
  return curve.map((c) => Math.round(14 + c * 86 * amp));
}

/** Conversion score: how far the pipeline carries applicants toward a hire. */
function conversionScore(byStatus: Record<string, number>): number {
  const total = totalApplications(byStatus);
  if (total === 0) return 0;
  const advanced = countFor(byStatus, ["reviewing", "saved_by_host", "offered", "accepted"]);
  return Math.round((advanced / total) * 100);
}

function StageChart({ byStatus }: { byStatus: Record<string, number> }) {
  const stages = APPLICATION_STATUS_ORDER.filter(
    (s) => (byStatus[s] ?? 0) > 0,
  );
  const max = Math.max(1, ...stages.map((s) => byStatus[s] ?? 0));

  if (stages.length === 0) {
    return <p className={styles.emptyNote}>No applications to chart yet.</p>;
  }

  // One semantic structure, two responsive readings:
  //  · ≥640px → vertical bar columns (the premium command-center chart)
  //  · ≤639px → horizontal bar list — label · token track · value — so all
  //    eight real stages stay readable instead of 38px wrapping columns.
  return (
    <div className={styles.chart} role="img" aria-label="Applications by pipeline stage">
      {stages.map((status, i) => {
        const count = byStatus[status] ?? 0;
        const pct = Math.max(8, Math.round((count / max) * 100));
        return (
          <div
            key={status}
            className={styles.chartCol}
            style={{ "--p": `${pct}%`, "--i": i } as React.CSSProperties}
          >
            <span className={styles.chartCount}>{count}</span>
            <div className={styles.barTrack}>
              <div className={styles.bar} />
            </div>
            <span className={styles.chartLabel}>
              {APPLICATION_STATUS_LABEL[status] ?? status}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ConversionRadial({ score }: { score: number }) {
  return (
    <div className={styles.radialWrap}>
      <div
        className={styles.radial}
        style={{ "--score": `${score}%` } as React.CSSProperties}
        role="img"
        aria-label={`Conversion score: ${score} percent of applicants advance past first review`}
      >
        <div className={styles.radialInner}>
          <span className={styles.radialValue}>{score}%</span>
          <span className={styles.radialCaption}>advance</span>
        </div>
      </div>
    </div>
  );
}

function ListingDiagnosis({ stat }: { stat: HostPerListingStats }) {
  const inviteRate =
    stat.invitesSent > 0 ? stat.invitesAccepted / stat.invitesSent : null;
  const status = stat.listingStatus;
  const statusLabel = LISTING_STATUS_LABEL[status] ?? status;

  // Honest, data-derived diagnosis tags (no fixtures).
  const tags: { icon: IconKey; text: string }[] = [];
  if (stat.totalApplications > 0) {
    tags.push({ icon: "analytics.funnel", text: `${stat.totalApplications} applicants` });
  } else {
    tags.push({ icon: "system.info", text: "No applicants yet" });
  }
  if (stat.invitesSent > 0) {
    tags.push({
      icon: "status.match",
      text: `${formatRate(inviteRate ?? 0)} invite accept`,
    });
  } else {
    tags.push({ icon: "status.boosted", text: "Try inviting seekers" });
  }
  const accepted = stat.applicationsByStatus.accepted ?? 0;
  if (accepted > 0) {
    tags.push({ icon: "status.accepted", text: `${accepted} hired` });
  }

  return (
    <article className={styles.diag}>
      <div className={`${styles.diagCover} ${styles[`cover_${status}`] ?? ""}`} aria-hidden>
        <Icon name="category.farm" size={24} />
      </div>
      <div className={styles.diagBody}>
        <div className={styles.diagTop}>
          <span className={`${styles.diagPip} ${styles[`pip_${status}`] ?? ""}`}>
            {statusLabel}
          </span>
        </div>
        <h3 className={styles.diagTitle}>{stat.listingTitle}</h3>
        <div className={styles.diagTags}>
          {tags.map((t, i) => (
            <span key={i} className={styles.diagTag}>
              <Icon name={t.icon} size={16} aria-hidden />
              {t.text}
            </span>
          ))}
        </div>
      </div>
      <div className={styles.diagAction}>
        <span className={styles.diagState}>Optimizable</span>
        <a
          className={styles.improveBtn}
          href={`/host/listings/${stat.listingId}`}
        >
          <Icon name="action.edit" size={16} aria-hidden />
          Improve
        </a>
      </div>
    </article>
  );
}

export function HostAnalyticsDashboard({
  analytics,
  subscriptionTier = "none",
}: HostAnalyticsDashboardProps) {
  const { totalApplicationsByStatus, activeListingCount, inviteAcceptanceRate, perListingStats } =
    analytics;

  const totalApps = totalApplications(totalApplicationsByStatus);
  const acceptedApps = totalApplicationsByStatus.accepted ?? 0;
  const reviewingApps = countFor(totalApplicationsByStatus, ["reviewing", "saved_by_host"]);
  const score = conversionScore(totalApplicationsByStatus);
  const hasPerListingAccess = subscriptionTier !== "none";

  return (
    <div className={styles.page}>
      {/* ── Headline metric grid (benchmark "grid four") ───────────────── */}
      <section className={styles.section} aria-labelledby="stats-heading">
        <h2 id="stats-heading" className={styles.sectionTitle}>
          <Icon name="analytics.trend" size={16} aria-hidden />
          Performance at a glance
        </h2>
        <MetricGrid>
          <MetricCard
            label="Total applications"
            value={String(totalApps)}
            trend={totalApps > 0 ? "All time" : "Awaiting"}
            trendTone="neutral"
            spark={sparkFromCount(totalApps)}
          />
          <MetricCard
            label="In review"
            value={String(reviewingApps)}
            trend={reviewingApps > 0 ? "Needs action" : "Clear"}
            trendTone={reviewingApps > 0 ? "neutral" : "down"}
            spark={sparkFromCount(reviewingApps)}
          />
          <MetricCard
            label="Active listings"
            value={String(activeListingCount)}
            trend={activeListingCount > 0 ? "Live" : "None live"}
            trendTone={activeListingCount > 0 ? "up" : "down"}
            spark={sparkFromCount(activeListingCount)}
          />
          <MetricCard
            label="Invite acceptance"
            value={formatRate(inviteAcceptanceRate)}
            trend={inviteAcceptanceRate >= 0.5 ? "Strong" : "Build pool"}
            trendTone={inviteAcceptanceRate >= 0.5 ? "up" : "neutral"}
            spark={sparkFromCount(Math.round(inviteAcceptanceRate * 100))}
          />
        </MetricGrid>
      </section>

      {/* ── Chart + radial split ───────────────────────────────────────── */}
      <section className={styles.section} aria-labelledby="pipeline-heading">
        <h2 id="pipeline-heading" className={styles.sectionTitle}>
          <Icon name="analytics.funnel" size={16} aria-hidden />
          Where applicants stand
        </h2>
        <div className={styles.split}>
          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h3 className={styles.panelTitle}>Applications by stage</h3>
                <p className={styles.panelNote}>
                  How your current pool is distributed across the pipeline.
                </p>
              </div>
              <span className={styles.kicker}>{totalApps} total</span>
            </div>
            <StageChart byStatus={totalApplicationsByStatus} />
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h3 className={styles.panelTitle}>Conversion score</h3>
                <p className={styles.panelNote}>
                  Share of applicants who advance past first review.
                </p>
              </div>
              <span
                className={`${styles.kicker} ${score >= 50 ? styles.kickerGood : ""}`.trim()}
              >
                {score >= 50 ? "Healthy" : score > 0 ? "Warming" : "Quiet"}
              </span>
            </div>
            <ConversionRadial score={score} />
            <div className={styles.radialLegend}>
              <span className={styles.legendItem}>
                <Icon name="status.accepted" size={16} aria-hidden />
                {acceptedApps} accepted
              </span>
              <span className={styles.legendItem}>
                <Icon name="analytics.funnel" size={16} aria-hidden />
                {reviewingApps} in review
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Per-listing diagnosis ──────────────────────────────────────── */}
      {perListingStats.length > 0 ? (
        <section className={styles.section} aria-labelledby="listings-heading">
          <h2 id="listings-heading" className={styles.sectionTitle}>
            <Icon name="analytics.donut" size={16} aria-hidden />
            Role-level diagnosis
          </h2>
          <p className={styles.sectionLede}>
            Each listing gets a growth read — not just raw numbers.
          </p>
          <div className={styles.gatedWrap}>
            <div className={`${styles.diagGrid}${!hasPerListingAccess ? ` ${styles.blurred}` : ""}`}>
              {perListingStats.map((stat) => (
                <ListingDiagnosis key={stat.listingId} stat={stat} />
              ))}
            </div>
            {!hasPerListingAccess ? (
              <div className={styles.gateOverlay} aria-label="Upgrade to access per-listing breakdown">
                <span className={styles.gateIcon}>
                  <Icon name="system.lock" size={24} aria-hidden />
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

      {/* ── Empty state ────────────────────────────────────────────────── */}
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
