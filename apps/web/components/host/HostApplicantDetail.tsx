import Link from "next/link";
import { Badge, DiscoveryCard, Icon } from "@explore-and-earn/ui";
import type { SeekerResume } from "@explore-and-earn/db";

import { CATEGORY_LABEL, toDiscoveryCardData } from "../discovery";
import { SeekerResumeCard } from "../seeker/SeekerResumeCard";
import {
  APPLICANT_STAGE_ICON,
  APPLICANT_STAGE_LABEL,
  type ApplicantStage,
  type HostApplicantItem,
} from "./models";
import styles from "./HostApplicantDetail.module.css";

export interface HostApplicantDetailProps {
  readonly applicant: HostApplicantItem;
  /**
   * The applicant's resume when the signed-in host is allowed to see it.
   * `null` renders the "not completed yet" empty state; `undefined` hides the
   * resume section entirely (for surfaces that do not load a resume).
   */
  readonly resume?: SeekerResume | null;
}

/**
 * Linear stage flow shown for reference on the applicant detail view. "declined"
 * is intentionally excluded — it is a terminal state rendered separately.
 */
const STAGE_FLOW: readonly ApplicantStage[] = [
  "new",
  "reviewing",
  "saved_by_host",
  "offered",
  "accepted",
];

/**
 * Host applicant detail — a review view for a single application. Surfaces the
 * applicant's identity, stage, cover note, resume (skills / bio / experience),
 * the targeted listing (canonical DiscoveryCard), and a link to message them.
 * Presentation only: the stage timeline is display-only and no hiring decision
 * is taken here (match/hiring pipeline is founder-gated and out of scope).
 */
export function HostApplicantDetail({
  applicant,
  resume,
}: HostApplicantDetailProps) {
  const { listing, stage } = applicant;
  const declined = stage === "declined";
  const currentIndex = STAGE_FLOW.indexOf(stage);
  const stageId = `applicant-stage-${applicant.id}`;

  // Aggregate skill_tags from experiences for the listing card skills slot
  const skills = resume
    ? Array.from(
        new Set(
          resume.experiences.flatMap((experience) => experience.skillTags),
        ),
      ).filter((skill) => skill.trim().length > 0)
    : [];

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <div className={styles.titleGroup}>
          <span className={styles.title}>{applicant.applicantName}</span>
          <span className={styles.meta}>
            Applied {applicant.appliedOn} · {listing.title}
          </span>
        </div>
        <Badge
          label={APPLICANT_STAGE_LABEL[stage]}
          icon={APPLICANT_STAGE_ICON[stage]}
        />
      </header>

      {applicant.note ? <p className={styles.note}>{applicant.note}</p> : null}

      {resume !== undefined ? (
        <section className={styles.section} aria-label="Applicant resume">
          <h3 className={styles.sectionTitle}>Resume</h3>
          {resume != null ? (
            <SeekerResumeCard
              resume={resume}
              displayNameOverride={applicant.applicantName}
            />
          ) : (
            <p className={styles.hint}>
              Seeker hasn&apos;t completed their resume yet
            </p>
          )}
        </section>
      ) : null}

      {applicant.threadId ? (
        <Link
          className={styles.message}
          href={`/host/messages/${applicant.threadId}`}
        >
          <Icon name="action.message" size={20} aria-hidden />
          <span>Message {applicant.applicantName}</span>
        </Link>
      ) : null}

      <section className={styles.section} aria-labelledby={stageId}>
        <h3 className={styles.sectionTitle} id={stageId}>
          Stage
        </h3>
        <p className={styles.hint}>
          Hiring pipeline will be available in an upcoming release.
        </p>
        <ol className={styles.flow}>
          {STAGE_FLOW.map((flowStage, index) => {
            const reached = !declined && index <= currentIndex;
            const current = !declined && index === currentIndex;
            return (
              <li
                key={flowStage}
                className={reached ? styles.flowStepReached : styles.flowStep}
                aria-current={current ? "step" : undefined}
              >
                <Icon
                  name={APPLICANT_STAGE_ICON[flowStage]}
                  size={16}
                  aria-hidden
                />
                <span>{APPLICANT_STAGE_LABEL[flowStage]}</span>
              </li>
            );
          })}
        </ol>
        {declined ? (
          <p className={styles.declined}>
            <Icon name="action.close" size={16} aria-hidden />
            <span>This application was declined.</span>
          </p>
        ) : null}
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Listing applied to</h3>
        <p className={styles.hint}>
          {CATEGORY_LABEL[listing.category]} · {listing.location}
        </p>
        <DiscoveryCard
          data={{ ...toDiscoveryCardData(listing), skills: skills.slice(0, 3) }}
          surface="host_applicant_review"
          actions={
            <Link
              className={styles.previewAction}
              href={`/host/listings/${listing.id}`}
            >
              View listing
            </Link>
          }
        />
      </section>
    </div>
  );
}
