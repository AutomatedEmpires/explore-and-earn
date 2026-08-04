import type { ReactNode } from "react";
import Image from "next/image";

import { Icon } from "@explore-and-earn/ui";
import {
  benefitStateLabel,
  housingPhotoLabel,
  NOT_STATED_LABEL,
  payStateLabel,
  type BenefitEvidenceStatus,
  type EffectiveHousingPhoto,
} from "@explore-and-earn/contracts";

import { ListingSection } from "./ListingSection";
import { isLocalStorageUrl } from "../../lib/storageUrl";
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
  readonly category?: string;
  readonly housingPhotos?: readonly EffectiveHousingPhoto[];
  /**
   * Per-benefit evidence (sourced listings). When a benefit is 'not_stated'
   * the cell reads "Not stated" — the source didn't say, so we never present
   * it as "Not included". Omitted → host-confirmed listing (unchanged).
   */
  readonly evidence?: {
    readonly housing: BenefitEvidenceStatus;
    readonly meals: BenefitEvidenceStatus;
    readonly pay: BenefitEvidenceStatus;
  };
  /** TrueValue ("what you'll save") slot, rendered inside the section. */
  readonly children?: ReactNode;
}

/* The included/not-included/not-stated wording is a shared honesty rule, not a
   local presentation choice — see benefitStateLabel in contracts/provenance. */
const benefitCellValue = benefitStateLabel;

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
  category,
  housingPhotos = [],
  evidence,
  children,
}: DealUpfrontProps) {
  // "Not stated" is a non-assertion and must not wear asserted-fact styling —
  // the value element carries data-state so the stylesheet can de-emphasise it.
  // Compared against the imported constant, never a re-typed string.
  const housingValue = benefitCellValue(housingIncluded, evidence?.housing);
  const mealsValue = benefitCellValue(mealsIncluded, evidence?.meals);
  const payValue = payStateLabel(paySummary, evidence?.pay);
  const stateOf = (value: string) =>
    value === NOT_STATED_LABEL ? "not_stated" : undefined;
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
          <div className={styles.cellValue} data-state={stateOf(housingValue)}>
            {housingValue}
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
          <div className={styles.cellValue} data-state={stateOf(mealsValue)}>
            {mealsValue}
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
          <div className={styles.cellValue} data-state={stateOf(payValue)}>
            {payValue}
          </div>
        </div>
      </div>

      {housingIncluded && housingPhotos.length > 0 ? (
        <section className={styles.housingEvidence} aria-labelledby="housing-evidence-title">
          <div className={styles.evidenceHead}>
            <Icon name="nav.photos" size={18} aria-hidden />
            <h3 className={styles.evidenceTitle} id="housing-evidence-title">
              Housing evidence
            </h3>
          </div>
          <div className={styles.evidenceGrid}>
            {housingPhotos.map((photo) => {
              const label = housingPhotoLabel(photo.role, category);
              return (
                <figure className={styles.evidencePhoto} key={photo.role}>
                  <div className={styles.evidenceImage}>
                    <Image
                      src={photo.url}
                      alt={`${label} provided by the host`}
                      fill
                      sizes="(max-width: 639px) 50vw, 320px"
                      className={styles.evidenceImg}
                      unoptimized={isLocalStorageUrl(photo.url)}
                    />
                  </div>
                  <figcaption className={styles.evidenceLabel}>{label}</figcaption>
                </figure>
              );
            })}
          </div>
        </section>
      ) : null}

      {children}
    </ListingSection>
  );
}
