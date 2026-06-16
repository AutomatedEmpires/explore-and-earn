import Link from "next/link";
import { Badge, DiscoveryCard, type DiscoveryCardProps } from "@explore-and-earn/ui";

import { toDiscoveryCardData } from "../discovery";
import { HostApplicantCardActions } from "./HostApplicantCardActions";
import {
  APPLICANT_STAGE_ICON,
  APPLICANT_STAGE_LABEL,
  type ApplicantStage,
  type HostApplicantItem,
} from "./models";
import styles from "./HostApplicantCard.module.css";

export interface HostApplicantCardProps {
  readonly applicant: HostApplicantItem;
}

function stageToCardState(stage: ApplicantStage): DiscoveryCardProps["cardState"] {
  if (stage === "offered") return "offered";
  if (stage === "declined") return "not_selected";
  return undefined;
}

/** Initials fallback avatar (no avatar URL in the host applicant view-model). */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

/**
 * Host-side applicant review. Renders the SINGLE canonical DiscoveryCard on its
 * host_applicant_review surface (no forked card), wrapped with the applicant's
 * identity, stage, and the host-side Skip / Save / Offer control row in the
 * card action slot.
 */
export function HostApplicantCard({ applicant }: HostApplicantCardProps) {
  return (
    <article className={styles.card}>
      <div className={styles.meta}>
        <div className={styles.who}>
          <span className={styles.avatar} aria-hidden>
            {initials(applicant.applicantName)}
          </span>
          <div className={styles.whoText}>
            <Link className={styles.nameLink} href={`/host/applicants/${applicant.id}`}>
              <span className={styles.name}>{applicant.applicantName}</span>
            </Link>
            <span className={styles.applied}>Applied {applicant.appliedOn}</span>
          </div>
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
        cardState={stageToCardState(applicant.stage)}
        actions={
          <HostApplicantCardActions
            applicantId={applicant.id}
            initialStage={applicant.stage}
          />
        }
      />
    </article>
  );
}
