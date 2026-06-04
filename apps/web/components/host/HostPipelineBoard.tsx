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
}

/**
 * Applicant pipeline board. Groups applicants into their stage sections in
 * funnel order, each with a live count derived from countByStage.
 *
 * Presentation ONLY — this is a read-only overview: there is no drag-and-drop
 * and no control that changes an applicant's stage (the hiring pipeline is
 * founder-gated and out of scope). Cards reuse the canonical HostApplicantCard,
 * which links into the applicant detail view.
 */
export function HostPipelineBoard({ applicants }: HostPipelineBoardProps) {
  const counts = countByStage(applicants);

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
                  <HostApplicantCard key={applicant.id} applicant={applicant} />
                ))}
              </div>
            ) : (
              <p className={styles.empty}>No applicants in this stage.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
