import Link from "next/link";
import { Badge, DiscoveryCard, Icon } from "@explore-and-earn/ui";

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

/**
 * Host applicant detail — a review view for a single application. Surfaces the
 * applicant's identity, stage, note, the targeted listing (canonical
 * DiscoveryCard), and links to message them or open the listing. Presentation
 * only: the stage timeline is display-only and no hiring decision is taken here
 * (match/hiring pipeline is founder-gated and out of scope).
 */
export function HostApplicantDetail({ applicant }: HostApplicantDetailProps) {
  const { listing, stage } = applicant;
  const declined = stage === "declined";
  const currentIndex = STAGE_FLOW.indexOf(stage);
  const stageId = `applicant-stage-${applicant.id}`;

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
