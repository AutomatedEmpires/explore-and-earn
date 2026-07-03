"use client";

import type { OpportunityCategory } from "@explore-and-earn/contracts";
import { Icon } from "@explore-and-earn/ui";

import { CATEGORY_ICON, CATEGORY_LABEL } from "../discovery";
import styles from "./SeekQuickFilters.module.css";

/** The four real lanes (mix is a fallback, never a filter lane). */
const LANES: readonly OpportunityCategory[] = [
  "farm",
  "maritime",
  "remote",
  "seasonal",
];

export interface SeekQuickFiltersProps {
  readonly housing: boolean;
  readonly meals: boolean;
  readonly category: OpportunityCategory | null;
  readonly onToggleHousing: () => void;
  readonly onToggleMeals: () => void;
  readonly onSelectLane: (lane: OpportunityCategory) => void;
  /** Opens the full filter sheet (pay, start window, visa, location). */
  readonly onMore: () => void;
  /** Active-filter count for the More badge. */
  readonly moreCount: number;
}

/**
 * The triad-first quick search — Explore&Earn's signature discovery affordance.
 * Housing and Meals lead as one-tap toggles (the decisions that matter most for
 * seasonal/outdoor work and that no other job board structures), then the
 * category lanes, then everything else behind "More". Each chip just flips a URL
 * param via the existing search logic — no new filtering code, fully shareable.
 */
export function SeekQuickFilters({
  housing,
  meals,
  category,
  onToggleHousing,
  onToggleMeals,
  onSelectLane,
  onMore,
  moreCount,
}: SeekQuickFiltersProps) {
  return (
    <div className={styles.root} role="group" aria-label="Quick filters">
      <div className={styles.scroll}>
        <div className={styles.triad}>
          <button
            type="button"
            className={`${styles.chip} ${styles.housing}`}
            data-on={housing || undefined}
            aria-pressed={housing}
            onClick={onToggleHousing}
          >
            <Icon name="benefit.housing" size={16} aria-hidden />
            Housing
          </button>
          <button
            type="button"
            className={`${styles.chip} ${styles.meals}`}
            data-on={meals || undefined}
            aria-pressed={meals}
            onClick={onToggleMeals}
          >
            <Icon name="benefit.meals" size={16} aria-hidden />
            Meals
          </button>
        </div>

        <span className={styles.divider} aria-hidden="true" />

        <div className={styles.lanes}>
          {LANES.map((lane) => (
            <button
              key={lane}
              type="button"
              className={styles.chip}
              data-on={category === lane || undefined}
              aria-pressed={category === lane}
              onClick={() => onSelectLane(lane)}
            >
              <Icon name={CATEGORY_ICON[lane]} size={16} aria-hidden />
              {CATEGORY_LABEL[lane]}
            </button>
          ))}
        </div>

        <button
          type="button"
          className={`${styles.chip} ${styles.more}`}
          onClick={onMore}
        >
          <Icon name="action.filter" size={16} aria-hidden />
          More
          {moreCount > 0 ? <span className={styles.count}>{moreCount}</span> : null}
        </button>
      </div>
    </div>
  );
}
