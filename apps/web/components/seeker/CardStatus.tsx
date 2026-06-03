import { Icon, type IconKey } from "@explore-and-earn/ui";

import styles from "./CardStatus.module.css";

export interface CardStatusProps {
  readonly icon?: IconKey;
  readonly label: string;
  readonly detail?: string;
}

/**
 * Compact lifecycle status pill rendered in a DiscoveryCard's action slot
 * (replaces the default Save/Apply affordances for lifecycle buckets).
 */
export function CardStatus({ icon, label, detail }: CardStatusProps) {
  return (
    <span className={styles.status}>
      {icon ? <Icon name={icon} size={16} aria-hidden /> : null}
      <span className={styles.label}>{label}</span>
      {detail ? <span className={styles.detail}>{detail}</span> : null}
    </span>
  );
}
