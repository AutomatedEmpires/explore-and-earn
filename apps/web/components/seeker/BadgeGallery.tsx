import { Icon, type IconKey } from "@explore-and-earn/ui";
import {
  ALL_BADGE_KEYS,
  BADGE_GROUP_LABEL,
  BADGE_META,
  badgeProgress,
  type BadgeGroup,
  type BadgeKey,
  type SeekerBadgeStats,
} from "@explore-and-earn/db";

import styles from "./BadgeGallery.module.css";

export interface BadgeGalleryProps {
  readonly earned: readonly BadgeKey[];
  readonly stats: SeekerBadgeStats;
}

const GROUP_ORDER: readonly BadgeGroup[] = [
  "profile",
  "applications",
  "discovery",
  "outcomes",
  "community",
];

/**
 * The seeker's badge showcase: every badge grouped by theme, earned ones lit up,
 * locked ones dimmed with a progress bar toward the next milestone. Pure display —
 * the earned set + stats snapshot come from the badge reconciler.
 */
export function BadgeGallery({ earned, stats }: BadgeGalleryProps) {
  const earnedSet = new Set<BadgeKey>(earned);
  const earnedCount = ALL_BADGE_KEYS.filter((key) => earnedSet.has(key)).length;

  const byGroup: Record<BadgeGroup, BadgeKey[]> = {
    profile: [],
    applications: [],
    discovery: [],
    outcomes: [],
    community: [],
  };
  for (const key of ALL_BADGE_KEYS) {
    byGroup[BADGE_META[key].group].push(key);
  }

  return (
    <div className={styles.root}>
      <p className={styles.summary}>
        <strong>{earnedCount}</strong> of {ALL_BADGE_KEYS.length} badges earned
      </p>

      {GROUP_ORDER.map((group) => {
        const keys = byGroup[group];
        if (keys.length === 0) return null;
        return (
          <section key={group} className={styles.group}>
            <h2 className={styles.groupTitle}>{BADGE_GROUP_LABEL[group]}</h2>
            <ul className={styles.grid}>
              {keys.map((key) => {
                const meta = BADGE_META[key];
                const isEarned = earnedSet.has(key);
                const progress = isEarned ? 100 : badgeProgress(stats, key);
                return (
                  <li
                    key={key}
                    className={styles.card}
                    data-earned={isEarned ? "true" : undefined}
                    data-tier={meta.tier}
                  >
                    <span className={styles.medal} aria-hidden="true">
                      <Icon name={meta.icon as IconKey} size={22} />
                    </span>
                    <span className={styles.info}>
                      <span className={styles.label}>{meta.label}</span>
                      <span className={styles.desc}>{meta.description}</span>
                      {!isEarned && progress > 0 ? (
                        <span className={styles.track} aria-hidden="true">
                          <span
                            className={styles.fill}
                            style={{ width: `${progress}%` }}
                          />
                        </span>
                      ) : null}
                    </span>
                    <span className={styles.badgeStatus}>
                      {isEarned ? (
                        <Icon name="system.success" size={16} aria-label="Earned" />
                      ) : (
                        <Icon name="system.lock" size={15} aria-label="Locked" />
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
