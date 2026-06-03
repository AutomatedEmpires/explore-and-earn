import { Skeleton } from "@explore-and-earn/ui";

import styles from "./DiscoveryCardSkeleton.module.css";

export function DiscoveryCardSkeleton() {
  return (
    <div className={`ui-card ${styles.card}`} aria-hidden>
      <div className={styles.cover}>
        <Skeleton variant="rect" />
      </div>
      <div className={styles.title}>
        <Skeleton variant="text" />
      </div>
      <div className={styles.meta}>
        <Skeleton variant="text" />
      </div>
      <div className={styles.triad}>
        <div className={styles.chip}>
          <Skeleton variant="text" />
        </div>
        <div className={styles.chip}>
          <Skeleton variant="text" />
        </div>
        <div className={styles.chip}>
          <Skeleton variant="text" />
        </div>
      </div>
    </div>
  );
}
