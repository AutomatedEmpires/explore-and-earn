"use client";

import { useState, type ReactNode } from "react";
import type {
  BenefitTriad,
  ListingPayInsight,
  OpportunityCategory,
} from "@explore-and-earn/contracts";
import { Icon, type IconKey } from "@explore-and-earn/ui";

import { BenefitTrustModal } from "../../../components/discovery/BenefitTrustModal";
import { PayDetailsDrawer } from "../../../components/discovery/PayDetailsDrawer";
import { canOpenPayDetails } from "../../../components/discovery/payDetailsState";
import styles from "./page.module.css";

export interface ListingBenefitOverlayListing {
  readonly id: string;
  readonly category: OpportunityCategory;
  readonly benefits: BenefitTriad;
  readonly coverImageUrl?: string;
  readonly payInsight?: ListingPayInsight;
}

type BenefitKind = keyof BenefitTriad;

const BENEFIT_META: Readonly<
  Record<
    BenefitKind,
    {
      readonly label: string;
      readonly icon: IconKey;
      readonly className: string;
    }
  >
> = {
  housing: {
    label: "Housing",
    icon: "benefit.housing",
    className: styles.triadCellHousing,
  },
  meals: {
    label: "Meals",
    icon: "benefit.meals",
    className: styles.triadCellMeals,
  },
  pay: {
    label: "Pay",
    icon: "benefit.pay",
    className: styles.triadCellPay,
  },
};

function BenefitCell({
  kind,
  listing,
  onClick,
}: {
  readonly kind: BenefitKind;
  readonly listing: ListingBenefitOverlayListing;
  readonly onClick?: () => void;
}) {
  const meta = BENEFIT_META[kind];
  const benefit = listing.benefits[kind];
  const offered =
    benefit.provision === "provided" || benefit.provision === "partial";
  const value =
    benefit.summary ??
    (benefit.provision === "partial"
      ? "Partially provided"
      : offered
        ? "Provided"
        : "Not provided");
  const ariaLabel =
    kind === "pay"
      ? `Pay — ${value}`
      : `${meta.label}: ${offered ? "offered" : "not offered"} — ${value}`;
  const className = [
    styles.triadCell,
    meta.className,
    !offered && kind !== "pay" ? styles.triadCellNotProvided : "",
    onClick ? styles.triadButton : "",
  ]
    .filter(Boolean)
    .join(" ");
  const inner: ReactNode = (
    <>
      <span className={styles.triadHeader}>
        <Icon name={meta.icon} size={16} aria-hidden />
        <span className={styles.triadLabel}>{meta.label}</span>
        {kind !== "pay" ? (
          <Icon
            name={offered ? "system.success" : "system.error"}
            size={16}
            aria-hidden
          />
        ) : null}
      </span>
      <span className={styles.triadValue}>{value}</span>
    </>
  );

  return onClick ? (
    <button
      type="button"
      className={className}
      aria-label={ariaLabel}
      data-benefit-kind={kind}
      data-provision={benefit.provision}
      onClick={onClick}
    >
      {inner}
    </button>
  ) : (
    <div
      className={className}
      data-benefit-kind={kind}
      data-provision={benefit.provision}
    >
      {inner}
    </div>
  );
}

export function ListingBenefitTriad({
  listing,
}: {
  readonly listing: ListingBenefitOverlayListing;
}) {
  const [activeBenefit, setActiveBenefit] = useState<"housing" | "meals" | null>(
    null,
  );
  const [payOpen, setPayOpen] = useState(false);
  const payAvailable = canOpenPayDetails(listing.benefits.pay.provision);

  return (
    <>
      <div className={styles.triad}>
        <BenefitCell
          kind="housing"
          listing={listing}
          onClick={
            listing.benefits.housing.provision === "not_provided"
              ? undefined
              : () => setActiveBenefit("housing")
          }
        />
        <BenefitCell
          kind="meals"
          listing={listing}
          onClick={
            listing.benefits.meals.provision === "not_provided"
              ? undefined
              : () => setActiveBenefit("meals")
          }
        />
        <BenefitCell
          kind="pay"
          listing={listing}
          onClick={payAvailable ? () => setPayOpen(true) : undefined}
        />
      </div>

      <BenefitTrustModal
        listing={activeBenefit ? listing : null}
        bucket={activeBenefit}
        onClose={() => setActiveBenefit(null)}
      />
      <PayDetailsDrawer
        listing={payOpen && payAvailable ? listing : null}
        onClose={() => setPayOpen(false)}
      />
    </>
  );
}
