import { Icon, type IconKey } from "@explore-and-earn/ui";

import styles from "./ListingGlance.module.css";

export interface GlanceItem {
  readonly icon: IconKey;
  readonly label: string;
  readonly value: string;
}

export interface ListingGlanceProps {
  readonly items: readonly GlanceItem[];
}

/**
 * At-a-glance fact row — the quick reassurance strip ("where, when, what kind of
 * work, who's hosting") a seeker scans before reading further. The page builds
 * `items` from real listing fields only and omits any it can't fill, so this
 * renders nothing when there are no facts to show.
 */
export function ListingGlance({ items }: ListingGlanceProps) {
  if (items.length === 0) return null;

  return (
    <dl className={styles.grid}>
      {items.map((item) => (
        <div key={item.label} className={styles.cell}>
          <dt className={styles.label}>
            <Icon name={item.icon} size={16} aria-hidden />
            <span>{item.label}</span>
          </dt>
          <dd className={styles.value}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
