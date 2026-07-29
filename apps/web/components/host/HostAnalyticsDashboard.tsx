import type { HostAnalytics, HostPerListingStats } from "@explore-and-earn/db";
import { Icon, MetricCard, MetricGrid, type IconKey } from "@explore-and-earn/ui";

import styles from "./HostAnalyticsDashboard.module.css";

export interface HostAnalyticsDashboardProps {
  /**
   * Already scoped by getHostAnalytics. `analytics.analyticsScope` says which
   * plan depth produced it; on "basic", perListingStats is empty because the
   * server never fetched it into this object — not because this component hid
   * it.
   */
  readonly analytics: HostAnalytics;
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

/**
 * The funnel, as a bar list.
 *
 * THIS REPLACED A CONIC-GRADIENT RING, and the reason is D23 rather than taste.
 * The ring was rendered unconditionally with `--score: 0%`: a host on their
 * first day got a 168-pixel dial reading "0% advance", captioned "Quiet". A
 * dial at zero is not a neutral report of no data — it is a picture of failure,
 * drawn before anything has had a chance to happen. Bars are omitted when there
 * is nothing in them, and the panel itself is omitted when there is nothing at
 * all, so the page can be honestly silent.
 */
function ApplicationFunnel({
  byStatus,
  total,
}: {
  byStatus: Record<string, number>;
  total: number;
}) {
  const stages = APPLICATION_STATUS_ORDER.filter(
    (status) => (byStatus[status] ?? 0) > 0,
  );

  return (
    <>
      <ul className={styles.funnelList}>
        {stages.map((status) => {
          const count = byStatus[status] ?? 0;
          const pct = Math.round((count / Math.max(1, total)) * 100);
          return (
            <li key={status} className={styles.funnelRow}>
              <span className={styles.funnelLabel}>
                {APPLICATION_STATUS_LABEL[status] ?? status}
              </span>
              <span
                className={styles.track}
                role="img"
                aria-label={`${APPLICATION_STATUS_LABEL[status] ?? status}: ${count} of ${total} applications`}
              >
                <span
                  className={styles.trackFill}
                  style={{ "--fill": `${pct}%` } as React.CSSProperties}
                />
              </span>
              <span className={styles.funnelValue}>{count}</span>
            </li>
          );
        })}
      </ul>
      <p className={styles.panelNote}>
        Every application this account has received, in the pipeline&rsquo;s own
        stages. The figures are all-time — the data layer stores no dated
        counters, so there is no week-on-week comparison to show.
      </p>
    </>
  );
}

/**
 * A plain-language diagnosis for one listing — or nothing.
 *
 * D25 asks for diagnoses "ONLY where derivable with evidence". So this returns
 * null rather than reaching for a sentence: a listing with no applications and
 * no invitations has produced no evidence of anything, and "engagement is low"
 * would be a mood, not a finding. Every branch below names the numbers it is
 * reading, and those numbers are on the same row.
 */
export function diagnoseListing(stat: HostPerListingStats): string | null {
  const applications = stat.totalApplications;
  const sent = stat.invitesSent;
  const accepted = stat.applicationsByStatus.accepted ?? 0;
  const advanced = countFor(stat.applicationsByStatus, [
    "reviewing",
    "saved_by_host",
    "offered",
    "accepted",
  ]);

  if (applications === 0 && sent === 0) return null;

  if (applications === 0 && sent > 0) {
    return `${sent} invitation${sent === 1 ? "" : "s"} sent and no applications back — the audience you invited is not converting, so the role or the pay band is the thing to change before spending more credits.`;
  }

  if (applications > 0 && advanced === 0) {
    return `${applications} application${applications === 1 ? "" : "s"} and none moved past Applied — the pool exists, the review does not. This is a queue to work, not a listing to fix.`;
  }

  if (accepted > 0) {
    return `${accepted} accepted from ${applications} application${applications === 1 ? "" : "s"} — this role is closing candidates. Whatever it says about pay, housing and hours is worth copying into the ones that are not.`;
  }

  if (sent > 0 && stat.invitesAccepted === 0) {
    return `${applications} application${applications === 1 ? "" : "s"} arrived on their own, but none of the ${sent} invitation${sent === 1 ? "" : "s"} was accepted — organic reach is working and outreach is not.`;
  }

  return `${advanced} of ${applications} application${applications === 1 ? "" : "s"} advanced past first review — the pipeline is moving.`;
}

function ListingDiagnosis({ stat }: { stat: HostPerListingStats }) {
  const inviteRate =
    stat.invitesSent > 0 ? stat.invitesAccepted / stat.invitesSent : null;
  const status = stat.listingStatus;
  const statusLabel = LISTING_STATUS_LABEL[status] ?? status;
  const diagnosis = diagnoseListing(stat);

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
        <Icon name="nav.dashboard" size={24} />
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
        {diagnosis ? (
          <p className={styles.diagRead}>{diagnosis}</p>
        ) : (
          <p className={styles.diagRead}>
            Nothing has happened on this role yet, so there is nothing to
            diagnose.
          </p>
        )}
      </div>
      <div className={styles.diagAction}>
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

export function HostAnalyticsDashboard({ analytics }: HostAnalyticsDashboardProps) {
  const {
    totalApplicationsByStatus,
    activeListingCount,
    listingCount,
    inviteAcceptanceRate,
    perListingStats,
    analyticsScope,
  } = analytics;

  const totalApps = totalApplications(totalApplicationsByStatus);
  const acceptedApps = totalApplicationsByStatus.accepted ?? 0;
  const reviewingApps = countFor(totalApplicationsByStatus, ["reviewing", "saved_by_host"]);
  const score = conversionScore(totalApplicationsByStatus);
  const hasPerListingAccess = analyticsScope === "full";

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
          />
          <MetricCard
            label="In review"
            value={String(reviewingApps)}
            trend={reviewingApps > 0 ? "Needs action" : "Clear"}
            trendTone={reviewingApps > 0 ? "neutral" : "down"}
          />
          <MetricCard
            label="Active listings"
            value={String(activeListingCount)}
            trend={activeListingCount > 0 ? "Live" : "None live"}
            trendTone={activeListingCount > 0 ? "up" : "down"}
          />
          <MetricCard
            label="Invite acceptance"
            value={formatRate(inviteAcceptanceRate)}
            trend={inviteAcceptanceRate >= 0.5 ? "Strong" : "Build pool"}
            trendTone={inviteAcceptanceRate >= 0.5 ? "up" : "neutral"}
          />
        </MetricGrid>
      </section>

      {/* ── Pipeline: the stage chart and the funnel ────────────────────
          Both panels are behind `totalApps > 0`. A chart of nothing and a
          funnel of nothing are the zero-donut in a different shape. */}
      {totalApps > 0 ? (
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
                  <h3 className={styles.panelTitle}>The funnel</h3>
                  <p className={styles.panelNote}>
                    {score}% of applicants advance past first review —{" "}
                    {acceptedApps} accepted, {reviewingApps} in review.
                  </p>
                </div>
              </div>
              <ApplicationFunnel
                byStatus={totalApplicationsByStatus}
                total={totalApps}
              />
            </div>
          </div>
        </section>
      ) : null}

      {/* ── Discovery sources ──────────────────────────────────────────────
          §12 asks where seekers found each role. `events.source_surface` is a
          free-text, unindexed column with one writer in the whole app, and
          nothing rolls it up per host — so there is no split to render, and a
          three-lane chart split evenly would be a fabrication with a legend. */}
      <section className={styles.section} aria-labelledby="sources-heading">
        <h2 id="sources-heading" className={styles.sectionTitle}>
          <Icon name="analytics.source" size={16} aria-hidden />
          Where seekers found you
        </h2>
        <p className={styles.sectionLede}>
          Not measured yet. Discovery is not attributed to Seek, Swipe or Map
          per listing anywhere in the product, so this section stays empty
          rather than showing a split nothing recorded.
        </p>
      </section>

      {/* ── Listing comparison table ────────────────────────────────────
          The accessible equivalent of the diagnosis cards below, and the thing
          the CSV export serialises. Rendered as a real table because a
          role-by-role comparison IS tabular, and reading it column-wise is the
          whole point. */}
      {hasPerListingAccess && perListingStats.length > 0 ? (
        <section className={styles.section} aria-labelledby="compare-heading">
          <h2 id="compare-heading" className={styles.sectionTitle}>
            <Icon name="analytics.trend" size={16} aria-hidden />
            Role by role
          </h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className={styles.tableCaption}>
                Every listing on this account, with its own all-time counts.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Listing</th>
                  <th scope="col">Status</th>
                  <th scope="col">Applications</th>
                  <th scope="col">Advanced</th>
                  <th scope="col">Accepted</th>
                  <th scope="col">Invites sent</th>
                  <th scope="col">Invites accepted</th>
                </tr>
              </thead>
              <tbody>
                {perListingStats.map((stat) => (
                  <tr key={stat.listingId}>
                    <th scope="row">
                      <a
                        className={styles.tableLink}
                        href={`/host/listings/${stat.listingId}`}
                      >
                        {stat.listingTitle}
                      </a>
                    </th>
                    <td>
                      {LISTING_STATUS_LABEL[stat.listingStatus] ??
                        stat.listingStatus}
                    </td>
                    <td className={styles.num}>{stat.totalApplications}</td>
                    <td className={styles.num}>
                      {countFor(stat.applicationsByStatus, [
                        "reviewing",
                        "saved_by_host",
                        "offered",
                        "accepted",
                      ])}
                    </td>
                    <td className={styles.num}>
                      {stat.applicationsByStatus.accepted ?? 0}
                    </td>
                    <td className={styles.num}>{stat.invitesSent}</td>
                    <td className={styles.num}>{stat.invitesAccepted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* ── Per-listing diagnosis (the FULL-analytics entitlement) ─────── */}
      {hasPerListingAccess && perListingStats.length > 0 ? (
        <section className={styles.section} aria-labelledby="listings-heading">
          <h2 id="listings-heading" className={styles.sectionTitle}>
            <Icon name="analytics.donut" size={16} aria-hidden />
            Role-level diagnosis
          </h2>
          <p className={styles.sectionLede}>
            Each listing gets a growth read — not just raw numbers.
          </p>
          <div className={styles.diagGrid}>
            {perListingStats.map((stat) => (
              <ListingDiagnosis key={stat.listingId} stat={stat} />
            ))}
          </div>
        </section>
      ) : null}

      {/* ── The upsell, on data the host actually has ──────────────────────
          Shown only when there IS a per-listing breakdown to sell — a host with
          no listings is not upsold on a report of nothing. Nothing is blurred
          here because nothing was fetched: on the basic scope the server never
          put per-listing rows in this object. */}
      {!hasPerListingAccess && listingCount > 0 ? (
        <section className={styles.section} aria-labelledby="listings-heading">
          <h2 id="listings-heading" className={styles.sectionTitle}>
            <Icon name="analytics.donut" size={16} aria-hidden />
            Role-level diagnosis
          </h2>
          <div className={styles.gateOverlay} aria-label="Per-listing breakdown requires full analytics">
            <span className={styles.gateIcon}>
              <Icon name="system.lock" size={24} aria-hidden />
            </span>
            <p className={styles.gateTitle}>Full analytics required</p>
            <p className={styles.gateNote}>
              Your plan includes the account-wide figures above. Professional and
              Enterprise add the per-listing breakdown — applications by stage, invites
              sent, and invites accepted for each of your {listingCount}{" "}
              {listingCount === 1 ? "listing" : "listings"}.
            </p>
            {/* D21: plans live at /host/plans and nowhere else. This used to
                point at /host/settings#billing, which rendered a second grid. */}
            <a className={styles.gateBtn} href="/host/plans">
              Compare plans
            </a>
          </div>
        </section>
      ) : null}

      {/* ── Empty state (D23) ──────────────────────────────────────────────
          Four things, in this order: what this page will contain, WHY it is
          empty, the one action that changes that, and a labelled sample so the
          value is legible before the data exists. The pre-V2 version had only
          the first sentence and a zero-value dial above it. */}
      {listingCount === 0 && totalApps === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>
            <Icon name="analytics.meter" size={24} aria-hidden />
          </span>
          <p className={styles.emptyTitle}>Nothing to measure yet</p>
          <p className={styles.emptyNote}>
            This page counts applications, pipeline stages and invitation
            outcomes per role. You have no listings, so none of those numbers
            exist — publishing one starts them.
          </p>
          <div className={styles.emptyActions}>
            <a className={styles.gateBtn} href="/host/listings/new">
              Create a listing
            </a>
            <a className={styles.emptyLink} href="/for-hosts/demo/dashboard">
              <Icon name="system.info" size={16} aria-hidden />
              See a populated example — sample data
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
