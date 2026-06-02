/**
 * The Housing / Meals / Pay triad — Explore&Earn's first-class value prop.
 * NEVER collapse this to a generic "Perks" label (product law; see AGENTS.md §1).
 *
 * Source of truth (Notion): Exact Data Dictionary, Discovery Card V1.
 * SPRINT ZERO: shape-level contracts only. Exact sub-enums (pay cadence,
 * housing type, meals type) come from the Canonical Enum Registry in
 * Database V1 — marked TODO(?) and left open here rather than invented.
 */

export const BENEFIT_KINDS = ["housing", "meals", "pay"] as const;
export type BenefitKind = (typeof BENEFIT_KINDS)[number];

/** Whether / how a benefit is provided. */
export const BENEFIT_PROVISION = [
	"provided",
	"partial",
	"not_provided",
] as const;
export type BenefitProvision = (typeof BENEFIT_PROVISION)[number];

export interface HousingInfo {
	readonly provision: BenefitProvision;
	/** Short human summary shown on the card (e.g. "Private cabin"). */
	readonly summary?: string;
	// TODO(?): housing_type enum (private/shared/rv/tent/...) from Enum Registry.
}

export interface MealsInfo {
	readonly provision: BenefitProvision;
	readonly summary?: string;
	// TODO(?): meals_type enum (all/some/stipend/...) from Enum Registry.
}

export interface PayInfo {
	readonly provision: BenefitProvision;
	/**
	 * Display string only at the contract layer (e.g. "$18/hr", "Stipend").
	 * Money math + currency stays OUT of Sprint Zero (no Stripe; cents-based
	 * canonical pricing is handled later in contracts/pricing + the Stripe seed).
	 */
	readonly summary?: string;
	// TODO(?): structured pay (amount_cents, cadence, currency) from Data Dictionary.
}

/** The always-visible triad block on every listing surface. */
export interface BenefitTriad {
	readonly housing: HousingInfo;
	readonly meals: MealsInfo;
	readonly pay: PayInfo;
}
