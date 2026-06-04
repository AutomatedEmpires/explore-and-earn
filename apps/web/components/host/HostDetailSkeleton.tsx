import { Skeleton } from "@explore-and-earn/ui";

import styles from "./HostDetailSkeleton.module.css";

/**
 * Generic loading placeholder for host detail surfaces (listing, applicant,
 * message thread). Rendered by route-level loading.tsx files during async
 * navigation so a transition never flashes a blank screen. Presentational
 * only: the Skeleton spans are aria-hidden and the region announces a Loading
 * label for assistive tech.
 */
export function HostDetailSkeleton() {
  return (
    <section className={styles.detail} role="status" aria-label="Loading">
      <div className={styles.head}>
        <span className={styles.titleLine}>
          <Skeleton variant="text" />
        </span>
        <span className={styles.metaLine}>
          <Skeleton variant="text" />
        </span>
      </div>
      <div className={styles.stats}>
        <Skeleton variant="rect" />
        <Skeleton variant="rect" />
        <Skeleton variant="rect" />
      </div>
      <div className={styles.body}>
        <Skeleton variant="text" />
        <Skeleton variant="text" />
        <span className={styles.shortLine}>
          <Skeleton variant="text" />
        </span>
      </div>
    </section>
  );
}
