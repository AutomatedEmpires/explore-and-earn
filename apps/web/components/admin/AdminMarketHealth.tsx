import { Icon, type IconKey } from "@explore-and-earn/ui";

import styles from "./AdminMarketHealth.module.css";

/**
 * Marketplace liquidity & health, derived ONLY from the counts the admin stats
 * query already exposes (getMarketplaceStats). No fabricated time series, no
 * per-region/per-category breakdown the query does not return — every figure
 * below is a present-tense ratio of two real counts, labelled honestly.
 *
 * The three liquidity reads a moderator actually steers by:
 *   - Demand pressure   — applications per live listing (is supply absorbing demand?)
 *   - Supply readiness   — share of the catalog that is actually live/indexed
 *   - Trust coverage     — share of hosts that are verified
 * Plus a conversion funnel (applied → accepted) from the two application counts.
 */
export interface AdminMarketHealthStats {
  readonly totalListings: number;
  readonly liveListings: number;
  readonly draftListings: number;
  readonly underReviewListings: number;
  readonly totalApplications: number;
  readonly pendingApplications: number;
  readonly acceptedApplications: number;
  readonly totalHosts: number;
  readonly verifiedHosts: number;
  readonly totalSeekers: number;
}

type Tone = "good" | "watch" | "low";

interface LiquidityRead {
  readonly key: string;
  readonly label: string;
  readonly icon: IconKey;
  /** 0–100 fill for the meter. */
  readonly fill: number;
  /** Headline figure (already formatted). */
  readonly figure: string;
  readonly caption: string;
  readonly tone: Tone;
  readonly toneLabel: string;
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

/** Clamp a free ratio (e.g. apps-per-listing) onto a 0–100 meter scale. */
function clampFill(value: number, ceiling: number): number {
  if (ceiling <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / ceiling) * 100)));
}

function ratio1dp(value: number): string {
  return value >= 10 ? String(Math.round(value)) : value.toFixed(1);
}

export function AdminMarketHealth({ stats }: { readonly stats: AdminMarketHealthStats }) {
  // Demand pressure: applications riding on the live supply. A healthy two-sided
  // market has demand without starving supply; very high = supply is thin.
  const demandPerLive =
    stats.liveListings > 0 ? stats.totalApplications / stats.liveListings : 0;
  const demandTone: Tone =
    stats.liveListings === 0
      ? "low"
      : demandPerLive >= 8
        ? "watch"
        : demandPerLive >= 1
          ? "good"
          : "low";

  const supplyPct = pct(stats.liveListings, stats.totalListings);
  const trustPct = pct(stats.verifiedHosts, stats.totalHosts);
  const acceptPct = pct(stats.acceptedApplications, stats.totalApplications);

  const reads: ReadonlyArray<LiquidityRead> = [
    {
      key: "demand",
      label: "Demand pressure",
      icon: "analytics.trend",
      fill: clampFill(demandPerLive, 8),
      figure:
        stats.liveListings > 0 ? `${ratio1dp(demandPerLive)}×` : "No supply",
      caption: `${stats.totalApplications} applications across ${stats.liveListings} live`,
      tone: demandTone,
      toneLabel:
        demandTone === "watch"
          ? "Supply thin"
          : demandTone === "good"
            ? "Liquid"
            : "Seed supply",
    },
    {
      key: "supply",
      label: "Supply live",
      icon: "status.open",
      fill: supplyPct,
      figure: `${supplyPct}%`,
      caption: `${stats.liveListings} of ${stats.totalListings} listings indexed`,
      tone: supplyPct >= 60 ? "good" : supplyPct >= 30 ? "watch" : "low",
      toneLabel: supplyPct >= 60 ? "Stocked" : "Building",
    },
    {
      key: "trust",
      label: "Trust coverage",
      icon: "trust.verified_host",
      fill: trustPct,
      figure: `${trustPct}%`,
      caption: `${stats.verifiedHosts} of ${stats.totalHosts} hosts verified`,
      tone: trustPct >= 60 ? "good" : trustPct >= 30 ? "watch" : "low",
      toneLabel: trustPct >= 60 ? "Trusted" : "Verify",
    },
    {
      key: "convert",
      label: "Accept rate",
      icon: "status.accepted",
      fill: acceptPct,
      figure: `${acceptPct}%`,
      caption: `${stats.acceptedApplications} accepted of ${stats.totalApplications}`,
      tone: acceptPct >= 25 ? "good" : acceptPct >= 10 ? "watch" : "low",
      toneLabel: acceptPct >= 25 ? "Flowing" : "Watch",
    },
  ];

  // Conversion funnel — three real, monotonic stages from the application counts.
  const funnel: ReadonlyArray<{
    readonly label: string;
    readonly value: number;
    readonly icon: IconKey;
  }> = [
    { label: "Applied", value: stats.totalApplications, icon: "action.apply" },
    {
      label: "Awaiting",
      value: stats.pendingApplications,
      icon: "status.applied",
    },
    {
      label: "Accepted",
      value: stats.acceptedApplications,
      icon: "status.accepted",
    },
  ];
  const funnelMax = Math.max(1, stats.totalApplications);

  return (
    <section className={styles.root} aria-label="Marketplace liquidity and health">
      <div className={styles.head}>
        <div>
          <h3 className={styles.title}>Marketplace liquidity</h3>
          <p className={styles.note}>
            Two-sided health from live counts — supply, demand, trust, and
            throughput. No projections, present state only.
          </p>
        </div>
        <span className={styles.seekers}>
          <Icon name="nav.seekers" size={16} aria-hidden />
          {stats.totalSeekers.toLocaleString("en-US")} seekers
        </span>
      </div>

      <ul className={styles.reads}>
        {reads.map((read) => (
          <li
            key={read.key}
            className={styles.read}
            data-tone={read.tone}
          >
            <div className={styles.readTop}>
              <span className={styles.readIcon} aria-hidden="true">
                <Icon name={read.icon} size={20} />
              </span>
              <span className={styles.readLabel}>{read.label}</span>
              <span className={styles.readTag}>{read.toneLabel}</span>
            </div>
            <span className={styles.readFigure}>{read.figure}</span>
            <div
              className={styles.meter}
              role="meter"
              aria-valuenow={read.fill}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${read.label}: ${read.figure}`}
            >
              <span
                className={styles.meterFill}
                style={{ width: `${read.fill}%` }}
                aria-hidden="true"
              />
            </div>
            <span className={styles.readCaption}>{read.caption}</span>
          </li>
        ))}
      </ul>

      <div className={styles.funnel} aria-label="Application conversion funnel">
        <span className={styles.funnelTitle}>Application funnel</span>
        <div className={styles.funnelBars}>
          {funnel.map((stage, index) => {
            const width = clampFill(stage.value, funnelMax);
            const dropoff =
              index > 0 && funnel[index - 1].value > 0
                ? pct(stage.value, funnel[index - 1].value)
                : null;
            return (
              <div key={stage.label} className={styles.funnelRow}>
                <span className={styles.funnelLabel}>
                  <Icon name={stage.icon} size={16} aria-hidden />
                  {stage.label}
                </span>
                <div className={styles.funnelTrack}>
                  <span
                    className={styles.funnelBar}
                    style={{ width: `${Math.max(4, width)}%` }}
                    aria-hidden="true"
                  />
                </div>
                <span className={styles.funnelValue}>
                  {stage.value.toLocaleString("en-US")}
                  {dropoff !== null ? (
                    <span className={styles.funnelDrop}>{dropoff}%</span>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
