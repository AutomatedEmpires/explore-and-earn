import Link from "next/link";

import styles from "./HostSectionHeading.module.css";

export interface HostSectionHeadingProps {
  readonly title: string;
  readonly description?: string;
  readonly actionLabel?: string;
  readonly actionHref?: string;
  /** Optional eyebrow kicker above the title (e.g. "Listings"). */
  readonly eyebrow?: string;
  /**
   * Heading level. Defaults to 2, which is right when this labels a section
   * INSIDE a page that already has an h1.
   *
   * Pass 1 where this component IS the page title. Found by auditing the
   * rendered DOM: /host/listings, /host/applicants and /host/outreach each had
   * ZERO h1 elements, because every one of them used this component as its page
   * heading and it was hardcoded to h2. A page whose only headings start at h2
   * gives a screen-reader user no landmark to jump to and reads as a fragment of
   * some larger document.
   */
  readonly level?: 1 | 2;
}

export function HostSectionHeading({
  title,
  description,
  actionLabel,
  actionHref,
  eyebrow,
  level = 2,
}: HostSectionHeadingProps) {
  const Title = level === 1 ? "h1" : "h2";
  return (
    <div className={styles.heading}>
      <div className={styles.text}>
        {eyebrow ? <span className={styles.eyebrow}>{eyebrow}</span> : null}
        <Title className={styles.title}>{title}</Title>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {actionLabel && actionHref ? (
        <Link className={styles.action} href={actionHref}>
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
