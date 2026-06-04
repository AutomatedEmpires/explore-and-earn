import Link from "next/link";

import styles from "./HostSectionHeading.module.css";

export interface HostSectionHeadingProps {
  readonly title: string;
  readonly description?: string;
  readonly actionLabel?: string;
  readonly actionHref?: string;
}

export function HostSectionHeading({
  title,
  description,
  actionLabel,
  actionHref,
}: HostSectionHeadingProps) {
  return (
    <div className={styles.heading}>
      <div className={styles.text}>
        <h2 className={styles.title}>{title}</h2>
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
