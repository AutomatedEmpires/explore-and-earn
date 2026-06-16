import Link from "next/link";

import { Icon } from "@explore-and-earn/ui";
import styles from "./SectionHeading.module.css";

export interface SectionHeadingProps {
  readonly title: string;
  readonly description?: string;
  readonly actionLabel?: string;
  readonly actionHref?: string;
  /** Heading element to render. Defaults to "h2" for in-page sections; pass "h1" when this heading is the page's primary title. */
  readonly as?: "h1" | "h2";
}

/** Section heading with optional trailing link (e.g. "See all"). */
export function SectionHeading({
  title,
  description,
  actionLabel,
  actionHref,
  as: Tag = "h2",
}: SectionHeadingProps) {
  return (
    <div className={styles.row}>
      <div className={styles.text}>
        <Tag className={styles.title}>{title}</Tag>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {actionLabel && actionHref ? (
        <Link className={styles.action} href={actionHref}>
          {actionLabel}
          <Icon name="action.forward" size={16} aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}
