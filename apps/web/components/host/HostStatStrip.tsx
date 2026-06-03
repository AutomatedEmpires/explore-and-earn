import { Icon, type IconKey } from "@explore-and-earn/ui";

import type { HostProfileSummary } from "./models";
import styles from "./HostStatStrip.module.css";

interface Stat {
  readonly icon: IconKey;
  readonly label: string;
  readonly value: number;
}

export interface HostStatStripProps {
  readonly profile: HostProfileSummary;
}

export function HostStatStrip({ profile }: HostStatStripProps) {
  const stats: readonly Stat[] = [
    { icon: "category.mix", label: "Active listings", value: profile.activeListings },
    { icon: "status.match", label: "Applicants", value: profile.totalApplicants },
    { icon: "status.open", label: "New", value: profile.newApplicants },
    { icon: "nav.messages", label: "Unread", value: profile.unreadMessages },
  ];

  return (
    <dl className={styles.strip}>
      {stats.map((stat) => (
        <div key={stat.label} className={styles.cell}>
          <dt className={styles.label}>
            <Icon name={stat.icon} size={20} aria-hidden />
            <span>{stat.label}</span>
          </dt>
          <dd className={styles.value}>{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}
