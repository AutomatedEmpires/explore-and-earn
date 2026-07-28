import Link from "next/link";
import { Icon } from "@explore-and-earn/ui";

import {
  APPLICANT_STAGE_ICON,
  APPLICANT_STAGE_LABEL,
  APPLICANT_STAGE_ORDER,
  countByStage,
  type HostApplicantItem,
} from "./models";
import { HostApplicantCard } from "./HostApplicantCard";
import styles from "./HostPipelineBoard.module.css";

export interface HostPipelineBoardProps {
  readonly applicants: readonly HostApplicantItem[];
  /** Pass through to the cards — the plan's match entitlement (ADR-039). */
  readonly showMatch?: boolean;
}

/**
 * Applicant pipeline board. Groups applicants into their stage sections in
 * funnel order, each with a live count derived from countByStage.
 *
 * STAGE MOVES ARE EXPLICIT BUTTONS, NOT DRAG-AND-DROP. Each card carries the
 * host-side controls, and `legalCardActions` renders only the edges
 * APPLICATION_TRANSITIONS permits from that row's stored status — an accepted
 * application shows none. A drop target cannot express that: it would accept a
 * gesture the database is about to refuse, and the host would learn the move was
 * illegal only from the error that followed it. The server remains the
 * authority either way (updateApplicationStatus re-checks every edge).
 *
 * On narrow screens the columns scroll horizontally with scroll-snap rather than
 * collapsing into one list — the whole point of the board is seeing the stages
 * side by side.
 */
export function HostPipelineBoard({
  applicants,
  showMatch = false,
}: HostPipelineBoardProps) {
  const counts = countByStage(applicants);

  // Whole-board empty → one designed state, not five repeated "no applicants".
  if (applicants.length === 0) {
    return (
      <div className={styles.emptyState}>
        <span className={styles.emptyIcon} aria-hidden>
          <Icon name="status.match" size={24} />
        </span>
        <p className={styles.emptyTitle}>No applicants yet</p>
        <p className={styles.emptySub}>
          As seekers apply, they flow through this pipeline — new, reviewing,
          saved, then offered. Invite standout seekers to get the first ones in.
        </p>
        <Link className={styles.emptyCta} href="/host/outreach">
          <Icon name="action.forward" size={16} aria-hidden />
          Invite seekers
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.board}>
      {APPLICANT_STAGE_ORDER.map((stage) => {
        const stageApplicants = applicants.filter(
          (applicant) => applicant.stage === stage,
        );
        return (
          <section
            key={stage}
            className={styles.column}
            aria-label={APPLICANT_STAGE_LABEL[stage]}
          >
            <header className={styles.columnHead}>
              <h3 className={styles.columnTitle}>
                <Icon name={APPLICANT_STAGE_ICON[stage]} size={20} aria-hidden />
                <span>{APPLICANT_STAGE_LABEL[stage]}</span>
              </h3>
              <span className={styles.count}>{counts[stage]}</span>
            </header>
            {stageApplicants.length > 0 ? (
              <div className={styles.stack}>
                {stageApplicants.map((applicant) => (
                  <HostApplicantCard
                    key={applicant.id}
                    applicant={applicant}
                    showMatch={showMatch}
                  />
                ))}
              </div>
            ) : (
              <p className={styles.empty}>Nobody here yet</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
