import type { ReactNode } from "react";
import Link from "next/link";

import { Icon } from "@explore-and-earn/ui";
import styles from "./SeekerPage.module.css";

export interface SeekerPageProps {
  /** Page title — rendered as the page's primary heading (h1). */
  readonly title: string;
  readonly description?: string;
  /** When set, renders a back affordance ("up to hub") above the title. */
  readonly backHref?: string;
  readonly backLabel?: string;
  /** Optional trailing action on the title row. */
  readonly actionLabel?: string;
  readonly actionHref?: string;
  readonly children: ReactNode;
}

/**
 * Shared seeker page scaffold — one header treatment + section rhythm for every
 * sub-page so the lane reads as a single, aligned surface. `BucketPage` and the
 * lifecycle/account pages compose this; never re-implement the page header.
 */
export function SeekerPage({
  title,
  description,
  backHref,
  backLabel = "Profile",
  actionLabel,
  actionHref,
  children,
}: SeekerPageProps) {
  return (
    <section className={styles.page}>
      <header className={styles.header}>
        {backHref ? (
          <Link href={backHref} className={styles.back}>
            <Icon name="action.back" size={16} aria-hidden />
            <span>{backLabel}</span>
          </Link>
        ) : null}
        <div className={styles.titleRow}>
          <div className={styles.titleText}>
            <h1 className={styles.title}>{title}</h1>
            {description ? <p className={styles.description}>{description}</p> : null}
          </div>
          {actionLabel && actionHref ? (
            <Link href={actionHref} className={styles.action}>
              {actionLabel}
              <Icon name="action.forward" size={16} aria-hidden />
            </Link>
          ) : null}
        </div>
      </header>
      <div className={styles.body}>{children}</div>
    </section>
  );
}
