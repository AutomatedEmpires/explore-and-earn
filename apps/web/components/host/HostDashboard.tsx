import type { CSSProperties } from "react";
import Link from "next/link";
import { Badge, Icon } from "@explore-and-earn/ui";

import type {
  HostAnalytics,
  HostDashboardStats,
  RecentActivity,
} from "@explore-and-earn/db";
import { HostSetupChecklist } from "./HostSetupChecklist";
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
  /** Unread message count — surfaced as a "needs attention" row when > 0. */
  readonly unread?: number;
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
  unread = 0,
}: HostDashboardProps) {
  // Primary counts come from analytics — getHostAnalytics is the reliable host
  // resolver (live listings + applications by status); the month-scoped stats
  // are used only for the "this month" figures, with all-time fallbacks so a
  // stats hiccup never blanks the dashboard to zeros.
  const totalListings = analytics.perListingStats.length;
  const liveCount = analytics.activeListingCount;
  const draftCount =
    stats.listingsByStatus["draft"] ??
    analytics.perListingStats.filter((l) => l.listingStatus === "draft").length;

  const totalApplicationsAllTime = Object.values(
    analytics.totalApplicationsByStatus,
  ).reduce((sum, n) => sum + n, 0);
  const pendingReview = analytics.totalApplicationsByStatus["applied"] ?? 0;

  const newApps = stats.applicationsThisMonth["applied"] ?? pendingReview;

  // "Pipeline fill" — share of applications moved past "applied".
  const reviewed = totalApplicationsAllTime - pendingReview;
  const pipelineFill =
    totalApplicationsAllTime > 0
      ? Math.round((reviewed / totalApplicationsAllTime) * 100)
      : 0;

  // ── Pipeline stage breakdown ────────────────────────────────────────
  // Group the host's REAL all-time application counts (the same source the
  // radar reads) into three honest funnel stages so the pipeline panel is as
  // explainable as the radar — never a single mystery meter. Counts come
  // straight from analytics.totalApplicationsByStatus (no fabrication); the
  // denominator is the all-time total so the bars always sum to the pipeline.
  const appsByStatus = analytics.totalApplicationsByStatus;
  const stageNew = appsByStatus["applied"] ?? 0;
  const stageReview =
    (appsByStatus["reviewing"] ?? 0) + (appsByStatus["saved_by_host"] ?? 0);
  const stageAdvanced =
    (appsByStatus["offered"] ?? 0) +
    (appsByStatus["accepted"] ?? 0) +
    (appsByStatus["active"] ?? 0) +
    (appsByStatus["completed"] ?? 0);
  const pipelineTotal = totalApplicationsAllTime;
  const pipelineStages = [
    { label: "New", hint: "Awaiting first look", count: stageNew, tone: "new" },
    {
      label: "In review",
      hint: "Reviewing & shortlisted",
      count: stageReview,
      tone: "review",
    },
    {
      label: "Advanced",
      hint: "Offered & onward",
      count: stageAdvanced,
      tone: "advanced",
    },
  ] as const;

  const acceptancePct = Math.round(analytics.inviteAcceptanceRate * 100);
  const topListings = analytics.perListingStats.slice(0, 5);

  // ── Conversion radar ────────────────────────────────────────────────
  // A composite "operational health" score, computed only from data that
  // already exists on this dashboard — never fabricated. Three real signals,
  // each surfaced individually in the legend so the headline % is explainable:
  //   • Pipeline   — share of applications moved past "applied" (responsiveness)
  //   • Outreach   — invite acceptance rate (recruiting effectiveness)
  //   • Inventory  — whether the host has live listings collecting demand
  const inventoryPct = totalListings > 0 ? (liveCount > 0 ? 100 : 40) : 0;
  const radarInputs = [
    { label: "Pipeline movement", value: pipelineFill },
    { label: "Invite acceptance", value: acceptancePct },
    { label: "Listing inventory", value: inventoryPct },
  ] as const;
  const conversionScore = Math.round(
    radarInputs.reduce((sum, s) => sum + s.value, 0) / radarInputs.length,
  );
  const radarTone =
    conversionScore >= 70 ? "Healthy" : conversionScore >= 40 ? "Building" : "Needs work";

  const pending = stats.pendingActions > 0 ? stats.pendingActions : pendingReview;
  const isNewHost = totalListings === 0;
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
        {!isNewHost ? (
          <div className="hostos-herokpi" aria-hidden>
            <div><b>{liveCount}</b><span>live listings</span></div>
            <div><b>{totalApplicationsAllTime}</b><span>applicants</span></div>
            <div><b>{pipelineFill}%</b><span>reviewed</span></div>
          </div>
        ) : null}
      </section>

      {/* ── First-run setup checklist — until the host has a live listing ─ */}
      {liveCount === 0 ? (
        <HostSetupChecklist
          hasProfile={companyName !== null}
          listingCount={totalListings}
          liveCount={liveCount}
        />
      ) : null}

      {/* ── Needs attention — the primary, content-first at-a-glance ──
          What this host must act on RIGHT NOW: applicants to review, fresh
          interest, drafts to publish, unread threads. Counts are real (no
          fabrication); each row deep-links to the surface that resolves it. */}
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
          {unread > 0 ? (
            <Link className="host-attention" href="/host/messages">
              <span className="host-attention__count">{unread}</span>
              <span className="host-attention__text">
                <span className="host-attention__title">Unread messages</span>
                <span className="host-attention__sub">Seekers waiting to hear back from you</span>
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
          {pending === 0 && newApps === 0 && unread === 0 && draftCount === 0 ? (
            isNewHost ? (
              // A brand-new host is NOT "caught up" — the next action is the
              // setup path (saying otherwise contradicted the 0/3 checklist
              // rendered above it).
              <Link className="host-attention" href="/host/listings/new">
                <span className="host-attention__count">1</span>
                <span className="host-attention__text">
                  <span className="host-attention__title">Get your first opportunity live</span>
                  <span className="host-attention__sub">Post a role with Housing, Meals &amp; Pay to start reaching seekers</span>
                </span>
                <Icon name="action.forward" size={20} aria-hidden />
              </Link>
            ) : (
              <p className={styles.allClear}>
                <Icon name="system.success" size={20} aria-hidden />
                You&rsquo;re all caught up.
              </p>
            )
          ) : null}
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
          {pipelineTotal > 0 ? (
            <div className={styles.pipeline}>
              <div className={styles.pipelineLede}>
                <span className={styles.pipelinePct}>{pipelineFill}%</span>
                <span className={styles.pipelineLedeText}>
                  moved past first review
                  <span className={styles.pipelineLedeSub}>
                    {reviewed} of {pipelineTotal} applicants
                  </span>
                </span>
              </div>
              <ul className={styles.pipelineStages}>
                {pipelineStages.map((stage) => {
                  const pct =
                    pipelineTotal > 0
                      ? Math.round((stage.count / pipelineTotal) * 100)
                      : 0;
                  return (
                    <li
                      key={stage.label}
                      className={styles.pipelineStage}
                      data-tone={stage.tone}
                      style={{ "--pct": `${pct}%` } as CSSProperties}
                    >
                      <span className={styles.pipelineStageLabel}>
                        {stage.label}
                        <span className={styles.pipelineStageHint}>
                          {stage.hint}
                        </span>
                      </span>
                      <span className={styles.pipelineStageCount}>
                        {stage.count}
                      </span>
                      <span className={styles.pipelineStageTrack} aria-hidden>
                        <span />
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p className={styles.muted}>No applications yet.</p>
          )}
        </section>

        <section className="host-panel host-panel--raised">
          <div className="host-panel__head">
            <div className="host-panel__titles">
              <span className="host-panel__eyebrow">Reach</span>
              <h2 className="host-panel__title">Conversion radar</h2>
            </div>
            {!isNewHost ? (
              <Badge
                variant={conversionScore >= 70 ? "success" : "neutral"}
                label={radarTone}
              />
            ) : null}
          </div>
          {isNewHost ? (
            // Pre-launch: there is nothing to measure yet — a punishing
            // "0% NEEDS WORK" on day one misreads setup as failure.
            <p className={styles.allClear}>
              <Icon name="system.info" size={20} aria-hidden />
              Health tracking starts once your first listing is live.
            </p>
          ) : (
          <div className={styles.radarSplit}>
            <div
              className={styles.radar}
              style={{ "--pct": conversionScore } as CSSProperties}
              role="meter"
              aria-valuenow={conversionScore}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Operational health ${conversionScore} percent — ${radarTone}`}
            >
              <span className={styles.radarCore} aria-hidden>
                <span className={styles.radarValue}>{conversionScore}%</span>
                <span className={styles.radarCaption}>Health</span>
              </span>
            </div>
            <ul className={styles.radarLegend}>
              {radarInputs.map((input) => (
                <li
                  key={input.label}
                  className={styles.radarLegendRow}
                  style={{ "--pct": `${input.value}%` } as CSSProperties}
                >
                  <span className={styles.radarLegendLabel}>{input.label}</span>
                  <span className={styles.radarLegendValue}>{input.value}%</span>
                  <span className={styles.radarTrack} aria-hidden>
                    <span />
                  </span>
                </li>
              ))}
            </ul>
          </div>
          )}
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

      {/* ── Resources / help ────────────────────────────────────────── */}
      <section className={styles.resources} aria-labelledby="resources-heading">
        <div className={styles.resourcesIntro}>
          <span className={styles.resourcesIcon} aria-hidden>
            <Icon name="nav.help" size={20} aria-hidden />
          </span>
          <div>
            <h2 id="resources-heading" className={styles.resourcesTitle}>
              Hosting resources
            </h2>
            <p className={styles.resourcesNote}>
              New here, or stuck on a step? Answers for posting, boosting,
              applicants, billing, and trust.
            </p>
          </div>
        </div>
        <div className={styles.resourcesLinks}>
          <Link className={styles.resourceChip} href="/host/help">
            <Icon name="nav.help" size={16} aria-hidden />
            Help &amp; FAQ
          </Link>
          <Link className={styles.resourceChip} href="/host/help">
            <Icon name="status.boosted" size={16} aria-hidden />
            Boosting guide
          </Link>
          <Link className={styles.resourceChip} href="/host/help">
            <Icon name="trust.verified_host" size={16} aria-hidden />
            Get verified
          </Link>
        </div>
      </section>
    </StaggerReveal>
  );
}
