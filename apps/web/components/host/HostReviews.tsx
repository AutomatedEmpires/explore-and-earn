import type { HostRatingSummary, HostReview } from "@explore-and-earn/db";
import { Icon, type IconKey } from "@explore-and-earn/ui";

import styles from "./HostReviews.module.css";

export interface HostReviewsProps {
  readonly hostName: string;
  readonly summary: HostRatingSummary;
  readonly reviews: readonly HostReview[];
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

/** The signature trust signal: % of seekers who confirmed a promise was kept. */
function TrustPill({
  icon,
  label,
  pct,
}: {
  readonly icon: IconKey;
  readonly label: string;
  readonly pct: number | null;
}) {
  if (pct === null) return null;
  return (
    <div className={styles.trustPill}>
      <Icon name={icon} size={20} aria-hidden />
      <span className={styles.trustLabel}>{label}</span>
      <span className={styles.trustPct}>{pct}%</span>
    </div>
  );
}

/** A kept / not-kept promise chip — colour carries the meaning. */
function PromiseChip({ kept, label }: { readonly kept: boolean; readonly label: string }) {
  return (
    <span className={`${styles.chip} ${kept ? styles.chipKept : styles.chipNot}`}>
      <Icon name={kept ? "system.success" : "system.error"} size={16} aria-hidden />
      {label}
    </span>
  );
}

/**
 * Host reviews — the two-sided trust layer. The hero is the triad-trust row
 * (was housing / meals / pay as promised?), the thing no other job board can
 * show; the star average + the review list sit alongside. Public, read-only.
 */
export function HostReviews({ hostName, summary, reviews }: HostReviewsProps) {
  if (summary.count === 0) {
    return (
      <section className={styles.root} aria-labelledby="reviews-heading">
        <h2 id="reviews-heading" className={styles.heading}>
          Trust &amp; reviews
        </h2>
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>
            <Icon name="trust.verified_host" size={24} aria-hidden />
          </span>
          <p className={styles.emptyText}>
            {hostName} is a new host — no reviews yet. Reviews come only from
            seekers who’ve actually worked here, and confirm whether the housing,
            meals, and pay were as promised.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.root} aria-labelledby="reviews-heading">
      <div className={styles.head}>
        <h2 id="reviews-heading" className={styles.heading}>
          Trust &amp; reviews
        </h2>
        <div className={styles.score}>
          <Icon name="status.featured" size={20} aria-hidden />
          <span className={styles.avg}>{summary.average.toFixed(1)}</span>
          <span className={styles.count}>
            {summary.count} {summary.count === 1 ? "review" : "reviews"}
          </span>
        </div>
      </div>

      <div className={styles.trustRow}>
        <TrustPill icon="benefit.housing" label="Housing as described" pct={summary.housingKeptPct} />
        <TrustPill icon="benefit.meals" label="Meals as described" pct={summary.mealsKeptPct} />
        <TrustPill icon="benefit.pay" label="Pay on time" pct={summary.payOnTimePct} />
      </div>

      <ul className={styles.list}>
        {reviews.map((r) => (
          <li key={r.id} className={styles.review}>
            <div className={styles.reviewHead}>
              <span className={styles.avatar} aria-hidden>
                {(r.seekerDisplayName.trim()[0] ?? "S").toUpperCase()}
              </span>
              <div className={styles.reviewWho}>
                <strong>{r.seekerDisplayName}</strong>
                <span className={styles.reviewDate}>{formatDate(r.createdAt)}</span>
              </div>
              <span className={styles.reviewRating}>
                <Icon name="status.featured" size={16} aria-hidden />
                {r.rating.toFixed(1)}
              </span>
            </div>
            {r.body ? <p className={styles.reviewBody}>{r.body}</p> : null}
            <div className={styles.reviewChips}>
              {r.housingAsDescribed != null ? (
                <PromiseChip kept={r.housingAsDescribed} label="Housing" />
              ) : null}
              {r.mealsAsDescribed != null ? (
                <PromiseChip kept={r.mealsAsDescribed} label="Meals" />
              ) : null}
              {r.payOnTime != null ? (
                <PromiseChip kept={r.payOnTime} label="Pay on time" />
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
