import Link from "next/link";
import { Icon, type IconKey, AppIllustration, type IllustrationKey } from "@explore-and-earn/ui";

import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
  readonly title?: string;
  readonly message?: string;
  /** Optional icon for the pill (defaults to the Seek compass). */
  readonly icon?: IconKey;
  /**
   * Optional spot illustration. When set, a framed paper-plate illustration is shown
   * in place of the icon pill — the premium treatment for primary empty states.
   */
  readonly illustration?: IllustrationKey;
  /** Optional forward CTA — turns a dead end into a next step. */
  readonly actionLabel?: string;
  readonly actionHref?: string;
}

export function EmptyState({
  title = "No opportunities yet",
  message = "Nothing matches here right now. Try widening your filters or check back soon — new host listings arrive often.",
  icon = "nav.seek",
  illustration,
  actionLabel,
  actionHref,
}: EmptyStateProps) {
  return (
    <div className={styles.empty} role="status">
      {illustration ? (
        <AppIllustration name={illustration} size="lg" aria-hidden />
      ) : (
        <span className={styles.icon}>
          <Icon name={icon} size={24} aria-hidden />
        </span>
      )}
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.message}>{message}</p>
      {actionLabel && actionHref ? (
        <Link className={styles.action} href={actionHref}>
          {actionLabel}
          <Icon name="action.forward" size={16} aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}
