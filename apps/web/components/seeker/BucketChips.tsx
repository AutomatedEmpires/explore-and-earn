import Link from "next/link";
import { Icon, type IconKey } from "@explore-and-earn/ui";

import type { SeekerStatusSummary } from "./models";
import styles from "./BucketChips.module.css";

interface BucketDef {
  readonly label: string;
  readonly href: string;
  readonly icon: IconKey;
  readonly count?: number;
}

export interface BucketChipsProps {
  readonly status: SeekerStatusSummary;
}

/** Quick links into each application lifecycle bucket, with live counts. */
export function BucketChips({ status }: BucketChipsProps) {
  const buckets: readonly BucketDef[] = [
    { label: "Saved", href: "/saved", icon: "nav.saved", count: status.savedCount },
    { label: "Applied", href: "/applied", icon: "action.apply", count: status.appliedCount },
    { label: "Offered", href: "/offered", icon: "status.match", count: status.offersCount },
    { label: "Accepted", href: "/accepted", icon: "category.seasonal" },
    { label: "Not selected", href: "/not-selected", icon: "system.info" },
    { label: "Invites", href: "/invites", icon: "action.message" },
  ];

  return (
    <nav className={styles.row} aria-label="Application buckets">
      {buckets.map((bucket) => (
        <Link key={bucket.href} className={styles.chip} href={bucket.href}>
          <Icon name={bucket.icon} size={16} aria-hidden />
          <span className={styles.label}>{bucket.label}</span>
          {typeof bucket.count === "number" ? (
            <span className={styles.count}>{bucket.count}</span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
