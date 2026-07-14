import type { ReactNode } from "react";

import { Icon, type IconKey } from "@explore-and-earn/ui";

import styles from "./ListingSection.module.css";

/**
 * Shared section shell for the immersive listing-detail page — a titled block
 * with an optional leading icon and an optional supporting subtitle. Every
 * immersive section (responsibilities, life-here, team, weather, …) renders
 * through this so the page reads as one consistent, scannable document.
 *
 * Presentational only. Callers gate on data existence BEFORE rendering a
 * section — this shell never invents an empty heading.
 */
export interface ListingSectionProps {
  /** Section heading, e.g. "What you'll do". */
  readonly title: string;
  /** Optional leading glyph from the <Icon> registry. */
  readonly icon?: IconKey;
  /** Optional one-line supporting context under the heading. */
  readonly subtitle?: string;
  /** DOM id for the heading, so aria-labelledby can point at it. */
  readonly headingId?: string;
  readonly children: ReactNode;
}

export function ListingSection({
  title,
  icon,
  subtitle,
  headingId,
  children,
}: ListingSectionProps) {
  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <div className={styles.head}>
        <h2 id={headingId} className={styles.title}>
          {icon ? <Icon name={icon} size={20} aria-hidden /> : null}
          <span>{title}</span>
        </h2>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}
