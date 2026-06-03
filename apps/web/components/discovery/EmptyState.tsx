import { Icon } from "@explore-and-earn/ui";

import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
  readonly title?: string;
  readonly message?: string;
}

export function EmptyState({
  title = "No opportunities yet",
  message = "Nothing matches here right now. Try widening your filters or check back soon — new host listings arrive often.",
}: EmptyStateProps) {
  return (
    <div className={styles.empty} role="status">
      <span className={styles.icon}>
        <Icon name="nav.seek" size={24} aria-hidden />
      </span>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.message}>{message}</p>
    </div>
  );
}
