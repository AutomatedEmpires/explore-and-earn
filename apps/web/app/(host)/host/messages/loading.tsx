import { Skeleton } from "@explore-and-earn/ui";

import { HostSectionHeading } from "../../../../components/host";
import styles from "./loading.module.css";

/**
 * Loading placeholder for the host messages list. Shown during async
 * navigation so the transition never flashes a blank screen.
 */
export default function Loading() {
  return (
    <section className={styles.block} role="status" aria-label="Loading messages">
      <HostSectionHeading
        title="Messages"
        description="Conversations with applicants and confirmed crew, unread first."
      />
      <div className={styles.list}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={styles.item}>
            <span className={styles.avatar}>
              <Skeleton variant="rect" />
            </span>
            <div className={styles.body}>
              <Skeleton variant="text" />
              <span className={styles.short}>
                <Skeleton variant="text" />
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
