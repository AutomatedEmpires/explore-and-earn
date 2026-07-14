import type { ReactNode } from "react";

import { Icon } from "@explore-and-earn/ui";

import { ListingSection } from "./ListingSection";
import styles from "./DealUpfront.module.css";

export interface DealUpfrontProps {
  readonly housingIncluded: boolean;
  readonly mealsIncluded: boolean;
  /** Free-text housing descriptor — shown under the Housing cell when present. */
  readonly housingDescription: string | null;
  /** Free-text meals descriptor — shown under the Meals cell when present. */
  readonly mealsDescription: string | null;
  /** Already-formatted pay summary, e.g. "$18/hr" or "See listing". */
  readonly paySummary: string;
  /** TrueValue ("what you'll save") slot, rendered inside the section. */
  readonly children?: ReactNode;
}

/**
 * "The deal, upfront" — the honest money-and-living block. The HOUSING / MEALS /
 * PAY triad with each benefit's real included/not-included state and any free-text
 * descriptor the host provided, followed by the TrueValue calculator passed as
 * children. No fabricated figures: descriptors render only when present.
 */
export function DealUpfront({
  housingIncluded,
  mealsIncluded,
  housingDescription,
  mealsDescription,
  paySummary,
  children,
}: DealUpfrontProps) {
  return (
    <ListingSection
      title="The deal, upfront"
      icon="benefit.pay"
      headingId="listing-deal"
      subtitle="What's covered, what you'll earn, and what that's really worth."
    >
      <div className={styles.triad}>
        <div className={`${styles.cell} ${styles.housing}`}>
          <div className={styles.cellHead}>
            <Icon name="benefit.housing" size={16} aria-hidden />
            <span className={styles.cellLabel}>Housing</span>
          </div>
          <div className={styles.cellValue}>
            {housingIncluded ? "Included" : "Not included"}
          </div>
          {housingIncluded && housingDescription ? (
            <p className={styles.cellDesc}>{housingDescription}</p>
          ) : null}
        </div>

        <div className={`${styles.cell} ${styles.meals}`}>
          <div className={styles.cellHead}>
            <Icon name="benefit.meals" size={16} aria-hidden />
            <span className={styles.cellLabel}>Meals</span>
          </div>
          <div className={styles.cellValue}>
            {mealsIncluded ? "Included" : "Not included"}
          </div>
          {mealsIncluded && mealsDescription ? (
            <p className={styles.cellDesc}>{mealsDescription}</p>
          ) : null}
        </div>

        <div className={`${styles.cell} ${styles.pay}`}>
          <div className={styles.cellHead}>
            <Icon name="benefit.pay" size={16} aria-hidden />
            <span className={styles.cellLabel}>Pay</span>
          </div>
          <div className={styles.cellValue}>{paySummary}</div>
        </div>
      </div>

      {children}
    </ListingSection>
  );
}
