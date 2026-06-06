import Link from "next/link";
import { Badge, Chip, DiscoveryCard, Icon } from "@explore-and-earn/ui";
import type { SeekerResume, SeekerResumeExperience } from "@explore-and-earn/db";

import { CATEGORY_LABEL, toDiscoveryCardData } from "../discovery";
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
];

/** Format an ISO-ish date string as "Mon YYYY"; falls back to the raw value. */
function formatResumeMonth(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/** "Mon YYYY – Mon YYYY" (or "– Present" while current), best-effort. */
function formatExperienceRange(experience: SeekerResumeExperience): string {
  const start = formatResumeMonth(experience.startDate);
  const end = experience.isCurrent
    ? "Present"
    : formatResumeMonth(experience.endDate);
  if (start && end) return `${start} \u2013 ${end}`;
  return start || end || "";
}

/** "Role · Company", dropping whichever parts are missing. */
function experienceHeadline(experience: SeekerResumeExperience): string {
  const parts = [experience.roleTitle, experience.companyName].filter(
    (part): part is string => Boolean(part && part.trim().length > 0),
  );
  return parts.join(" \u00b7 ") || "Experience";
}

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

  // No dedicated skills column exists yet, so resume "skills" are the unique
  // skill_tags aggregated across the applicant's experiences.
  const skills = resume
    ? Array.from(
        new Set(
          resume.experiences.flatMap((experience) => experience.skillTags),
        ),
      ).filter((skill) => skill.trim().length > 0)
    : [];
  const bio = resume?.profile?.bio ?? null;
  const experiences = resume?.experiences ?? [];
  const hasResumeContent =
    resume != null &&
    (skills.length > 0 || Boolean(bio) || experiences.length > 0);

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
          {hasResumeContent ? (
            <>
              {skills.length > 0 ? (
                <div className={styles.chips}>
                  {skills.map((skill) => (
                    <Chip key={skill}>{skill}</Chip>
                  ))}
                </div>
              ) : null}
              {bio ? <p className={styles.note}>{bio}</p> : null}
              {experiences.length > 0 ? (
                <ul className={styles.experiences}>
                  {experiences.map((experience) => {
                    const range = formatExperienceRange(experience);
                    return (
                      <li key={experience.id} className={styles.experience}>
                        <span className={styles.experienceTitle}>
                          {experienceHeadline(experience)}
                        </span>
                        {range ? (
                          <span className={styles.experienceMeta}>{range}</span>
                        ) : null}
                        {experience.summary ? (
                          <span className={styles.experienceSummary}>
                            {experience.summary}
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </>
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
          Shown for reference. Hiring decisions are not wired up in this preview.
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
          data={toDiscoveryCardData(listing)}
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
