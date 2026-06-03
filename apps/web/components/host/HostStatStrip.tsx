import { Icon, type IconKey } from "@explore-and-earn/ui";

import type { HostStats } from "./models";
import styles from "./HostStatStrip.module.css";

interface Stat {
  readonly icon: IconKey;
  readonly label: string;
  readonly value: number;
}

export interface HostStatStripProps {
  readonly stats: HostStats;
}

export function HostStatStrip({ stats }: HostStatStripProps) {
  const cells: readonly Stat[] = [
    { icon: "category.mix", label: "Active listings", value: stats.activeListings },
    { icon: "status.match", label: "Applicants", value: stats.totalApplicants },
    { icon: "status.open", label: "New", value: stats.newApplicants },
    { icon: "nav.messages", label: "Unread", value: stats.unreadMessages },
  ];

  return (
    <dl className={styles.strip}>
      {cells.map((cell) => (
        <div key={cell.label} className={styles.cell}>
          <dt className={styles.label}>
            <Icon name={cell.icon} size={20} aria-hidden />
            <span>{cell.label}</span>
          </dt>
          <dd className={styles.value}>{cell.value}</dd>
        </div>
      ))}
    </dl>
  );
}
