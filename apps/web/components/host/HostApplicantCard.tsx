import Link from "next/link";
import { Badge, DiscoveryCard } from "@explore-and-earn/ui";

import { toDiscoveryCardData } from "../discovery";
import {
  APPLICANT_STAGE_ICON,
  APPLICANT_STAGE_LABEL,
  type HostApplicantItem,
} from "./models";
import styles from "./HostApplicantCard.module.css";

export interface HostApplicantCardProps {
  readonly applicant: HostApplicantItem;
}

/**
 * Host-side applicant review. Renders the SINGLE canonical DiscoveryCard on its
 * host_applicant_review surface (no forked card), wrapped with the applicant's
 * identity, stage, and a link into the applicant detail view via the card's
 * action slot.
 */
export function HostApplicantCard({ applicant }: HostApplicantCardProps) {
  return (
    <article className={styles.card}>
      <div className={styles.meta}>
        <div className={styles.who}>
          <span className={styles.name}>{applicant.applicantName}</span>
          <span className={styles.applied}>Applied {applicant.appliedOn}</span>
        </div>
        <Badge
          label={APPLICANT_STAGE_LABEL[applicant.stage]}
          icon={APPLICANT_STAGE_ICON[applicant.stage]}
        />
      </div>
      {applicant.note ? <p className={styles.note}>{applicant.note}</p> : null}
      <DiscoveryCard
        data={toDiscoveryCardData(applicant.listing)}
        surface="host_applicant_review"
        actions={
          <Link className={styles.action} href={`/host/applicants/${applicant.id}`}>
            Review applicant
          </Link>
        }
      />
    </article>
  );
}
