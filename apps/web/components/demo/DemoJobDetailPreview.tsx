import Link from "next/link";
import { Icon, type IconKey } from "@explore-and-earn/ui";

import { DEMO_JOB, DEMO_LISTING } from "./enterpriseDemo";
import { DemoLabel } from "./DemoLabel";
import styles from "./demoChrome.module.css";

/**
 * A faithful listing-detail composition for the demo job.
 *
 * The production listing detail page resolves a row, its benefit evidence, its
 * provenance and its match score from the database and 404s on an id it cannot
 * find, so a fixture cannot render it. This is the presentational twin: same
 * information architecture (triad first, then what is included, then the work),
 * same tokens, same triad labels — driven entirely by the fixture, and labelled
 * on the surface as demo data.
 */

const TRIAD: readonly {
  readonly key: "housing" | "meals" | "pay";
  readonly label: string;
  readonly icon: IconKey;
  readonly cellClass: string;
}[] = [
  { key: "housing", label: "Housing", icon: "benefit.housing", cellClass: "triadHousing" },
  { key: "meals", label: "Meals", icon: "benefit.meals", cellClass: "triadMeals" },
  { key: "pay", label: "Pay", icon: "benefit.pay", cellClass: "triadPay" },
];

export function DemoJobDetailPreview({
  triadId,
  matchId,
}: {
  readonly triadId?: string;
  readonly matchId?: string;
}) {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <div>
          <h3 className={styles.panelTitle}>{DEMO_LISTING.title}</h3>
          <p className={styles.panelNote}>
            {DEMO_LISTING.host.name} · {DEMO_LISTING.location} ·{" "}
            {DEMO_LISTING.opportunityWindow}
          </p>
        </div>
        <DemoLabel text={DEMO_JOB.demoLabel} />
      </div>

      <div className={styles.triadRow} id={triadId}>
        {TRIAD.map((cell) => {
          const benefit = DEMO_LISTING.benefits[cell.key];
          return (
            <div
              key={cell.key}
              className={`${styles.triadCell} ${styles[cell.cellClass]}`}
            >
              <span className={styles.triadIcon}>
                <Icon name={cell.icon} size={20} aria-hidden />
              </span>
              <span>
                <span className={styles.triadLabel}>{cell.label}</span>
                <span className={styles.triadValue}>
                  {benefit.summary ?? benefit.provision}
                </span>
              </span>
            </div>
          );
        })}
      </div>

      <div className={styles.factGrid}>
        <div className={styles.fact}>
          <span className={styles.factLabel}>Employment</span>
          <span className={styles.factValue}>{DEMO_JOB.employmentType}</span>
        </div>
        <div className={styles.fact}>
          <span className={styles.factLabel}>Hours</span>
          <span className={styles.factValue}>{DEMO_JOB.hoursPerWeek}</span>
        </div>
        <div className={styles.fact}>
          <span className={styles.factLabel}>Dates</span>
          <span className={styles.factValue}>
            {DEMO_LISTING.begins} – {DEMO_LISTING.ends}
          </span>
        </div>
        <div className={styles.fact} id={matchId}>
          <span className={styles.factLabel}>Match score</span>
          <span className={styles.factValue}>
            {DEMO_LISTING.matchScore} for this seeker
          </span>
        </div>
      </div>

      <p className={styles.panelNote}>{DEMO_JOB.summary}</p>

      <div>
        <h4 className={styles.includedTitle}>What&rsquo;s included</h4>
        <ul className={styles.includedGrid}>
          {DEMO_JOB.included.map((item) => (
            <li key={item.title} className={styles.includedItem}>
              <span className={styles.includedTitle}>{item.title}</span>
              <span className={styles.includedDetail}>{item.detail}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h4 className={styles.includedTitle}>The work</h4>
        <ul className={styles.bulletList}>
          {DEMO_JOB.responsibilities.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <div className={styles.applyRow}>
        <Link className={styles.primaryCta} href="/sign-up?role=host">
          <Icon name="nav.host" size={18} aria-hidden />
          Build your host profile
        </Link>
        <p className={styles.applyNote}>
          {DEMO_JOB.experience}. A seeker applies in about{" "}
          {DEMO_JOB.applyMinutes} minutes because their resume is already on file.
        </p>
      </div>
    </div>
  );
}
