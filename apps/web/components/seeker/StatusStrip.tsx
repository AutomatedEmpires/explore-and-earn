import { Icon } from "@explore-and-earn/ui";

import { RESUME_APPLY_THRESHOLD, type SeekerStatusSummary } from "./models";
import styles from "./StatusStrip.module.css";

export interface StatusStripProps {
  readonly status: SeekerStatusSummary;
}

/** Adventure status strip — at-a-glance pipeline counts + resume readiness. */
export function StatusStrip({ status }: StatusStripProps) {
  const resumeReady = status.resumeCompletion >= RESUME_APPLY_THRESHOLD;
  const resumeClass = resumeReady
    ? styles.item
    : `${styles.item} ${styles.priority}`;

  return (
    <ul className={styles.strip} aria-label="Adventure status">
      <li className={resumeClass}>
        <span className={styles.label}>
          <Icon name="nav.profile" size={16} aria-hidden /> Resume
        </span>
        <span className={styles.value}>{status.resumeCompletion}%</span>
      </li>
      <li className={styles.item}>
        <span className={styles.label}>
          <Icon name="nav.saved" size={16} aria-hidden /> Saved
        </span>
        <span className={styles.value}>{status.savedCount}</span>
      </li>
      <li className={styles.item}>
        <span className={styles.label}>
          <Icon name="action.apply" size={16} aria-hidden /> Applied
        </span>
        <span className={styles.value}>{status.appliedCount}</span>
      </li>
      <li className={styles.item}>
        <span className={styles.label}>
          <Icon name="status.match" size={16} aria-hidden /> Offers
        </span>
        <span className={styles.value}>{status.offersCount}</span>
      </li>
      <li className={styles.item}>
        <span className={styles.label}>
          <Icon name="category.seasonal" size={16} aria-hidden /> Upcoming
        </span>
        <span className={styles.value}>{status.acceptedUpcoming ?? "—"}</span>
      </li>
    </ul>
  );
}
