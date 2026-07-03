import type { HostRatingSummary } from "@explore-and-earn/db";
import { Icon, type IconKey } from "@explore-and-earn/ui";

import styles from "./HostTrustBand.module.css";

export interface HostTrustBandProps {
  readonly summary: HostRatingSummary;
  readonly verified: boolean;
  /** Anchor the "read reviews" link to the reviews section. */
  readonly reviewsHref?: string;
}

function TrustStat({
  icon,
  label,
  pct,
}: {
  readonly icon: IconKey;
  readonly label: string;
  readonly pct: number | null;
}) {
  if (pct === null) return null;
  const strong = pct >= 90;
  return (
    <div className={styles.stat}>
      <span className={styles.statIcon} aria-hidden>
        <Icon name={icon} size={20} aria-hidden />
      </span>
      <span className={styles.statPct} data-strong={strong || undefined}>
        {pct}
        <i>%</i>
      </span>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statMeter} aria-hidden>
        <span className={styles.statMeterFill} style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}

/**
 * Public host trust band — the conversion hook for the public profile. It
 * elevates the signature triad-kept proof (housing / meals / pay confirmed by
 * seekers who actually worked here) into a single credibility strip near the
 * top of the page. Renders only when real reviews exist; the data comes
 * straight from getHostRatingSummary, so nothing is fabricated.
 */
export function HostTrustBand({
  summary,
  verified,
  reviewsHref = "#reviews-heading",
}: HostTrustBandProps) {
  if (summary.count === 0) return null;

  const hasTriad =
    summary.housingKeptPct !== null ||
    summary.mealsKeptPct !== null ||
    summary.payOnTimePct !== null;

  return (
    <aside className={styles.bandWrap} aria-label="Host trust signals">
      <div className={styles.band}>
        {/* Score block — the headline */}
        <a className={styles.score} href={reviewsHref}>
          <span className={styles.scoreStars} aria-hidden>
            <Icon name="status.featured" size={24} aria-hidden />
          </span>
          <span className={styles.scoreValue}>{summary.average.toFixed(1)}</span>
          <span className={styles.scoreMeta}>
            <span className={styles.scoreCount}>
              {summary.count} {summary.count === 1 ? "review" : "reviews"}
            </span>
            {verified ? (
              <span className={styles.scoreVerified}>
                <Icon name="trust.verified_host" size={16} aria-hidden />
                Verified Host
              </span>
            ) : null}
          </span>
        </a>

        {/* Triad-kept proof — the thing no ordinary job board can show */}
        {hasTriad ? (
          <div className={styles.stats}>
            <p className={styles.statsKicker}>
              Promises kept, confirmed by seekers who worked here
            </p>
            <div className={styles.statsRow}>
              <TrustStat
                icon="benefit.housing"
                label="Housing as described"
                pct={summary.housingKeptPct}
              />
              <TrustStat
                icon="benefit.meals"
                label="Meals as described"
                pct={summary.mealsKeptPct}
              />
              <TrustStat
                icon="benefit.pay"
                label="Pay on time"
                pct={summary.payOnTimePct}
              />
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
