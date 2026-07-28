import Link from "next/link";
import { Badge, Icon } from "@explore-and-earn/ui";
import {
  MATCH_BANDS,
  matchBandFor,
  topMatchReasons,
  type MatchBand,
} from "@explore-and-earn/contracts";

import { HostApplicantCardActions } from "./HostApplicantCardActions";
import {
  APPLICANT_STAGE_ICON,
  APPLICANT_STAGE_LABEL,
  type HostApplicantItem,
} from "./models";
import styles from "./HostApplicantCard.module.css";

export interface HostApplicantCardProps {
  readonly applicant: HostApplicantItem;
  /**
   * Show the match READING — the band plus the components that produced it.
   * Off by default so surfaces that have not loaded scores render nothing
   * rather than an empty chip.
   */
  readonly showMatch?: boolean;
  /** Hide the stage-move controls (used where the board is read-only). */
  readonly hideActions?: boolean;
}

/** Canonical band label (issue #46) for a real match score. */
function bandLabel(band: MatchBand | undefined, score: number): string {
  const id = band ?? matchBandFor(score);
  return MATCH_BANDS.find((entry) => entry.id === id)?.label ?? "Match";
}

/** Initials fallback avatar — the only avatar a host-side applicant card gives. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

function relativeDay(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const days = Math.round((then - Date.now()) / 86_400_000);
  if (days === 0) return "today";
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  return rtf.format(days, "day");
}

/**
 * A candidate, as a host reviews them.
 *
 * WHAT CHANGED. The card used to wrap the whole DiscoveryCard for the LISTING
 * the person applied to — a seeker-facing advert for the host's own job,
 * repeated once per candidate, with the person reduced to a name above it. The
 * subject of a candidate card is the candidate.
 *
 * AND THE SCORE IS NO LONGER THE HEADLINE. It used to render as "84/100" with
 * nothing to explain it. `topMatchReasons` turns the persisted components into
 * the two that actually carried the number, so the host reads "strong on
 * availability and pay" and the figure is the supporting detail. When no
 * components were stored, no reason is shown — never a sentence reverse-
 * engineered from the score.
 */
export function HostApplicantCard({
  applicant,
  showMatch = false,
  hideActions = false,
}: HostApplicantCardProps) {
  const { matchScore, matchComponents } = applicant;
  const roundedScore = matchScore != null ? Math.round(matchScore) : null;
  const reasons = matchComponents ? topMatchReasons(matchComponents) : [];
  const showReading = showMatch && roundedScore != null;

  return (
    <article className={styles.card}>
      <header className={styles.head}>
        <span className={styles.avatar} aria-hidden>
          {initials(applicant.applicantName)}
        </span>
        <div className={styles.who}>
          <Link className={styles.nameLink} href={`/host/applicants/${applicant.id}`}>
            {applicant.applicantName}
          </Link>
          <span className={styles.role}>{applicant.listing.title}</span>
          <span className={styles.meta}>
            Applied {applicant.appliedOn}
            {applicant.reapplied ? " · re-applied" : ""}
          </span>
        </div>
        <Badge
          label={APPLICANT_STAGE_LABEL[applicant.stage]}
          icon={APPLICANT_STAGE_ICON[applicant.stage]}
        />
      </header>

      {showReading ? (
        <div className={styles.match}>
          <span className={styles.matchBand}>
            <Icon name="status.match" size={16} aria-hidden />
            {bandLabel(applicant.matchBand, roundedScore)}
          </span>
          {reasons.length > 0 ? (
            <p className={styles.matchReason}>
              Strongest on{" "}
              {reasons.map((reason, index) => (
                <span key={reason.component}>
                  {index > 0 ? " and " : ""}
                  <b>{reason.label}</b>
                </span>
              ))}
            </p>
          ) : (
            // The score exists but its components were not stored. Saying WHY
            // is not possible, and inventing a reason from the number is the
            // failure mode this branch exists to prevent.
            <p className={styles.matchReasonMuted}>
              No component breakdown was recorded for this match.
            </p>
          )}
          <span className={`${styles.matchScore} ui-tabular`}>
            {roundedScore}
            <span className={styles.matchScoreUnit}>/100</span>
          </span>
        </div>
      ) : null}

      {applicant.note ? (
        <p className={styles.note}>
          <span className={styles.noteLabel}>Their message</span>
          {applicant.note}
        </p>
      ) : null}

      <dl className={styles.facts}>
        <div>
          <dt>Applied to</dt>
          <dd>{applicant.listing.location}</dd>
        </div>
        <div>
          <dt>Window</dt>
          <dd>{applicant.listing.opportunityWindow}</dd>
        </div>
        {applicant.lastMessageAt ? (
          <div>
            <dt>Last message</dt>
            <dd>
              {relativeDay(applicant.lastMessageAt)}
              {applicant.lastMessageFrom === "seeker" ? " · awaiting your reply" : ""}
            </dd>
          </div>
        ) : null}
      </dl>

      <footer className={styles.foot}>
        <Link className={styles.review} href={`/host/applicants/${applicant.id}`}>
          Review
          <Icon name="action.forward" size={16} aria-hidden />
        </Link>
        {applicant.threadId ? (
          <Link className={styles.message} href={`/host/messages/${applicant.threadId}`}>
            <Icon name="action.message" size={16} aria-hidden />
            Message
          </Link>
        ) : null}
        {!hideActions ? (
          <HostApplicantCardActions
            applicantId={applicant.id}
            initialStage={applicant.stage}
            status={applicant.status}
          />
        ) : null}
      </footer>
    </article>
  );
}
