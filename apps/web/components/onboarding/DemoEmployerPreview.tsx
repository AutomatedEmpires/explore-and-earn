import { Icon } from "@explore-and-earn/ui";

import { formatCompensation } from "../../lib/format";
import {
  DEMO_APPLICANTS,
  DEMO_DATA_LABEL,
  DEMO_FLAGSHIP_ROLE,
  DEMO_ORG,
  DEMO_STAGE_LABEL,
  applicantsForRole,
} from "../demo/enterpriseDemo";
import { DemoLabel } from "../demo/DemoLabel";
import { DemoMetricTiles } from "../demo/DemoAnalyticsExtras";
import { DemoOrgIdentity } from "../demo/DemoOrgIdentity";
import { DemoRoleCard } from "../demo/DemoRoles";
import styles from "./onboardingPreview.module.css";

/**
 * "Here is what you are building" — the live employer profile on the welcome
 * step (spec V2-E §1).
 *
 * WHY A DEMO EMPLOYER AND NOT A DRAWING. The welcome screen used to be three
 * value bullets and a button: a host was asked to spend eight minutes on a
 * product they had seen no part of. This shows the finished thing instead, and
 * it shows it through THE PRODUCTION COMPONENTS — DemoOrgIdentity is the
 * identity band, DemoRoleCard is the role card, DemoMetricTiles is the real
 * MetricCard grid from the shared library. Only the RECORDS are fixtures. A
 * redrawn mock would be a promise about the product; this is a look at it.
 *
 * EVERYTHING IS LABELLED. Every block carries the demo label the fixtures
 * themselves declare, so nothing here can be mistaken for the host's own data
 * before they have entered any. The names in the applicant glimpse are invented
 * and get initials rather than faces, which is the rule the whole demo follows.
 *
 * NO FIGURE IS TYPED HERE. The triad reads its money through the formatter
 * chokepoint and its housing and meals lines off the role record, the pipeline
 * counts are derived from the applicant records by applicantsForRole, and the
 * tiles derive themselves. A preview that quoted its own numbers would drift
 * from the demo it claims to be a window onto.
 */

/** Pay, housing and meals for the flagship role — the three-decision triad. */
function flagshipTriad(): ReadonlyArray<{
  readonly key: string;
  readonly icon: "benefit.housing" | "benefit.meals" | "benefit.pay";
  readonly label: string;
  readonly value: string;
}> {
  const role = DEMO_FLAGSHIP_ROLE;
  return [
    {
      key: "housing",
      icon: "benefit.housing",
      label: "Housing",
      value: role.housing.type,
    },
    {
      key: "meals",
      icon: "benefit.meals",
      label: "Meals",
      value:
        role.meals.costCents === 0
          ? "Two crew meals a day, included"
          : "Meals available at cost",
    },
    {
      key: "pay",
      icon: "benefit.pay",
      label: "Pay",
      value: formatCompensation({
        minCents: role.payMinCents,
        maxCents: role.payMaxCents,
        unit: "hour",
      }),
    },
  ];
}

export interface DemoEmployerPreviewProps {
  /** Heading level, so the panel can nest under whichever heading owns it. */
  readonly headingLevel?: "h2" | "h3";
  readonly className?: string;
}

export function DemoEmployerPreview({
  headingLevel = "h2",
  className,
}: DemoEmployerPreviewProps) {
  const Heading = headingLevel;
  const forRole = applicantsForRole(DEMO_FLAGSHIP_ROLE.id, DEMO_APPLICANTS);
  const glimpse = [...forRole]
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 3);

  return (
    <section
      className={`${styles.showcase} ${className ?? ""}`}
      aria-labelledby="onboarding-demo-preview-title"
    >
      <div className={styles.showcaseHead}>
        <Heading
          id="onboarding-demo-preview-title"
          className={styles.showcaseTitle}
        >
          This is what you are building
        </Heading>
        <p className={styles.showcaseLead}>
          A finished employer profile on Explore &amp; Earn, shown with sample
          records so you can see the shape before you fill in your own.
        </p>
        <DemoLabel text={DEMO_DATA_LABEL} />
      </div>

      {/* The identity band — real component, real photograph, sample org. */}
      <DemoOrgIdentity />

      {/* One complete role, then the three things a seeker decides on. */}
      <div className={styles.roleBlock}>
        <DemoRoleCard role={DEMO_FLAGSHIP_ROLE} applicants={DEMO_APPLICANTS} />

        <ul className={styles.triad} aria-label="Housing, meals and pay on this role">
          {flagshipTriad().map((cell) => (
            <li key={cell.key} className={styles.triadCell} data-benefit={cell.key}>
              <span className={styles.triadIcon} aria-hidden>
                <Icon name={cell.icon} size={18} />
              </span>
              <span className={styles.triadText}>
                <span className={styles.triadLabel}>{cell.label}</span>
                <span className={styles.triadValue}>{cell.value}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Who applied, and how the season is going. Both glimpses, not surfaces. */}
      <div className={styles.glimpses}>
        <div className={styles.glimpse}>
          <div className={styles.glimpseHead}>
            <h3 className={styles.glimpseTitle}>
              {forRole.length} people applied to this role
            </h3>
            <DemoLabel text={DEMO_DATA_LABEL} />
          </div>
          <ul className={styles.applicants}>
            {glimpse.map((applicant) => (
              <li key={applicant.id} className={styles.applicant}>
                <span className={styles.applicantAvatar} aria-hidden>
                  {applicant.initials}
                </span>
                <span className={styles.applicantText}>
                  <span className={styles.applicantName}>{applicant.name}</span>
                  <span className={styles.applicantMeta}>
                    {applicant.location} · {DEMO_STAGE_LABEL[applicant.stage]}
                  </span>
                </span>
                <span className={styles.applicantScore}>
                  {applicant.matchScore}
                  <span className={styles.applicantScoreUnit}>match</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.glimpse}>
          <div className={styles.glimpseHead}>
            <h3 className={styles.glimpseTitle}>How the season is going</h3>
          </div>
          <DemoMetricTiles limit={3} />
          <p className={styles.glimpseNote}>
            {DEMO_ORG.seasonLabel} — every figure here is derived from the sample
            records above, not typed in.
          </p>
        </div>
      </div>
    </section>
  );
}
