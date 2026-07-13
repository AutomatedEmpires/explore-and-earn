import Link from "next/link";
import { Icon, type IconKey, AppIllustration, type IllustrationKey } from "@explore-and-earn/ui";

import styles from "./EmptyState.module.css";

/** Link-based recovery chip — no client state, just an href. */
export interface EmptyStateChip {
  readonly label: string;
  readonly href: string;
  readonly icon?: IconKey;
}

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
  /**
   * Filter-removal chips: each link drops one active filter, turning the dead
   * end into a recovery surface. Rendered with a ✕ mark after the label.
   */
  readonly filterChips?: readonly EmptyStateChip[];
  readonly filterChipsLabel?: string;
  /** Alternate paths to explore (e.g. the four category lanes). */
  readonly suggestions?: readonly EmptyStateChip[];
  readonly suggestionsLabel?: string;
  /** Optional forward CTA — turns a dead end into a next step. */
  readonly actionLabel?: string;
  readonly actionHref?: string;
}

export function EmptyState({
  title = "No opportunities yet",
  message = "Nothing matches here right now. Try widening your filters or check back soon — new host listings arrive often.",
  icon = "nav.seek",
  illustration,
  filterChips,
  filterChipsLabel = "Loosen a filter",
  suggestions,
  suggestionsLabel = "Or scout a different lane",
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
      {filterChips && filterChips.length > 0 ? (
        <div className={styles.chipGroup}>
          <p className={styles.chipGroupLabel}>{filterChipsLabel}</p>
          <div className={styles.chips}>
            {filterChips.map((chip) => (
              <Link
                key={`${chip.label}-${chip.href}`}
                className={styles.chip}
                href={chip.href}
                aria-label={`Remove ${chip.label} filter`}
              >
                {chip.icon ? <Icon name={chip.icon} size={16} aria-hidden /> : null}
                {chip.label}
                <span className={styles.chipRemoveMark}>
                  <Icon name="action.close" size={14} aria-hidden />
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
      {suggestions && suggestions.length > 0 ? (
        <div className={styles.chipGroup}>
          <p className={styles.chipGroupLabel}>{suggestionsLabel}</p>
          <div className={styles.chips}>
            {suggestions.map((chip) => (
              <Link
                key={`${chip.label}-${chip.href}`}
                className={styles.chip}
                href={chip.href}
              >
                {chip.icon ? <Icon name={chip.icon} size={16} aria-hidden /> : null}
                {chip.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
      {actionLabel && actionHref ? (
        <Link className={styles.action} href={actionHref}>
          {actionLabel}
          <Icon name="action.forward" size={16} aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}
