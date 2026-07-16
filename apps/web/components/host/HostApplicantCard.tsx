import Link from "next/link";
import { Badge, DiscoveryCard, Icon, type DiscoveryCardProps } from "@explore-and-earn/ui";
import { MATCH_BANDS, matchBandFor, type MatchBand } from "@explore-and-earn/contracts";

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
  /**
   * Surface the applicant's REAL ADR-040 match score (never a fabricated
   * signal): used by the host "Matched seekers" bucket. Off by default so the
   * applicant pipeline board renders unchanged. The chip is shown ONLY when a
   * real score has actually been computed for this seeker × listing pair.
   */
  readonly showMatch?: boolean;
}

function stageToCardState(stage: ApplicantStage): DiscoveryCardProps["cardState"] {
  if (stage === "offered") return "offered";
  if (stage === "declined") return "not_selected";
  return undefined;
}

/** Canonical band label (issue #46) for a real match score. */
function bandLabel(band: MatchBand | undefined, score: number): string {
  const id = band ?? matchBandFor(score);
  return MATCH_BANDS.find((entry) => entry.id === id)?.label ?? "Match";
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
export function HostApplicantCard({ applicant, showMatch = false }: HostApplicantCardProps) {
  const { matchScore } = applicant;
  const showMatchChip = showMatch && matchScore != null;
  const roundedScore = matchScore != null ? Math.round(matchScore) : null;

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
      {showMatchChip && roundedScore != null ? (
        <div
          className={styles.match}
          aria-label={`Match ${roundedScore} out of 100 — ${bandLabel(applicant.matchBand, roundedScore)}`}
        >
          <Icon name="status.match" size={16} aria-hidden />
          <span className={styles.matchLabel}>
            {bandLabel(applicant.matchBand, roundedScore)}
          </span>
          <span className={styles.matchScore}>
            {roundedScore}
            <span className={styles.matchScoreUnit}>/100</span>
          </span>
        </div>
      ) : null}
      {applicant.note ? <p className={styles.note}>{applicant.note}</p> : null}
      <DiscoveryCard
        data={toDiscoveryCardData(applicant.listing)}
        surface="host_applicant_review"
        cardState={stageToCardState(applicant.stage)}
        actions={
          <HostApplicantCardActions
            applicantId={applicant.id}
            initialStage={applicant.stage}
            status={applicant.status}
          />
        }
      />
    </article>
  );
}
