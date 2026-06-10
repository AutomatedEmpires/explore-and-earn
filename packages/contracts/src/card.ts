/**
 * Discovery Card V1 — typed canon mirror.
 *
 * Source of truth (committed): docs/product/discovery-card-v1.md
 *   ("Canonical Card System Specification" in Notion).
 * Companion doc: docs/source-of-truth/contracts/discovery-card-contract.md
 *
 * SCOPE / GUARDRAIL
 * -----------------
 * This file mirrors ENUMERATED canon registries only — the value triad keys,
 * the Verified-Host qualifier, card surfaces, actions + destinations,
 * conditional badges, and the canonical card field list + requiredness.
 *
 * It intentionally does NOT introduce a persisted object model, data-dictionary
 * row shape, or DB schema. Those remain gated and must arrive via a scoped,
 * founder-approved build pack (see packages/contracts/README.md and
 * docs/product/product-principles.md — "What's out of scope for now").
 *
 * It follows the same "mirror the canonical registry" pattern already used by
 * enums.ts and lifecycles.ts. Pure types + const tuples; zero runtime deps.
 */

/**
 * The mandatory value triad — the only three questions that matter.
 * Canon (product-principles.md #1): Housing / Meals / Pay are always first-class
 * and are NEVER relabeled "Perks." The three keys are fixed by canon; the values
 * are short human-readable display strings.
 */
export interface OpportunityTriad {
	/** "Where will I sleep?" */
	housing: string
	/** "What will I eat?" */
	meals: string
	/** "What will I earn?" */
	pay: string
}

/**
 * The Verified-Host badge ALWAYS carries this exact qualifier. There is no
 * implied platform verification — host trust is a permanent founder trust/legal
 * gate (guardrail G22). Do not change this string without founder approval.
 */
export const VERIFIED_HOST_QUALIFIER = "Self-Declared by Host" as const
export type VerifiedHostQualifier = typeof VERIFIED_HOST_QUALIFIER

/**
 * Surfaces rendered by the SINGLE Discovery Card component. One component serves
 * all surfaces; behavior varies by variant + props, never by forking the system
 * (product-principles.md #2, #6). Canon: "Surfaces."
 */
export const DISCOVERY_CARD_SURFACES = [
	"discovery_feed",
	"swipe",
	"map",
	"saved",
	"applied",
	"offered",
	"matched",
	"host_applicant_review",
	"invites",
	"admin_review",
] as const
export type DiscoveryCardSurface = (typeof DISCOVERY_CARD_SURFACES)[number]

/** Card actions a seeker can take. Canon: "Actions & destinations." */
export const DISCOVERY_CARD_ACTIONS = [
	"open_listing",
	"open_map",
	"open_housing",
	"open_meals",
	"open_host",
	"quick_apply",
	"save",
	"report",
] as const
export type DiscoveryCardAction = (typeof DISCOVERY_CARD_ACTIONS)[number]

/**
 * Canonical destination/effect for each action (committed canon table).
 * Navigation/intent description only — no routing or handlers implemented here.
 * The annotation forces every action to have a destination (exhaustiveness).
 */
export const DISCOVERY_CARD_ACTION_DESTINATIONS: Record<DiscoveryCardAction, string> = {
	open_listing: "listing detail",
	open_map: "map view",
	open_housing: "housing detail + evidence photo bucket",
	open_meals: "meals detail + evidence photo bucket",
	open_host: "host profile",
	quick_apply: "apply / login flow",
	save: "add to saved",
	report: "moderation flow",
}

/**
 * Badges shown CONDITIONALLY, in addition to the always-on category badge and
 * the Verified-Host badge. "boosted" treatment must stay subtle and never
 * read as an ad (product-principles.md #5, zero dark patterns).
 *
 * "featured" has been removed — the platform does not use a featured concept.
 * "seasonal" is a category, not a conditional badge; included for legacy compat.
 */
export const DISCOVERY_CARD_CONDITIONAL_BADGES = [
	"seasonal",
	"boosted",
] as const
export type DiscoveryCardConditionalBadge =
	(typeof DISCOVERY_CARD_CONDITIONAL_BADGES)[number]

/**
 * The canonical fields a Discovery Card represents, mirrored from the
 * "Data the card represents" table. This is the FIELD REGISTRY only — concrete
 * persisted types per field belong to the gated data-dictionary build pack and
 * are deliberately omitted here.
 */
export const DISCOVERY_CARD_FIELDS = [
	"hero_photo",
	"host_avatar",
	"host_name",
	"job_title",
	"location",
	"opportunity_window",
	"housing",
	"meals",
	"pay",
	"verified_host_badge",
	"category_badge",
	"seasonal_featured_badge",
	"match_score",
	"boosted_treatment",
	"quick_apply",
] as const
export type DiscoveryCardField = (typeof DISCOVERY_CARD_FIELDS)[number]

/** Whether a canonical card field is always present or shown conditionally. */
export type CardFieldRequirement = "required" | "conditional"

/**
 * Requiredness per canonical field (committed canon). The annotation forces an
 * entry for every field in DISCOVERY_CARD_FIELDS (exhaustiveness).
 * NOTE: match_score is a DISPLAY field present only on the "matched" surface;
 * the matching algorithm itself is forbidden in Sprint Zero and is out of scope.
 */
export const DISCOVERY_CARD_FIELD_REQUIREMENT: Record<
	DiscoveryCardField,
	CardFieldRequirement
> = {
	hero_photo: "required",
	host_avatar: "required",
	host_name: "required",
	job_title: "required",
	location: "required",
	opportunity_window: "required",
	housing: "required",
	meals: "required",
	pay: "required",
	verified_host_badge: "required",
	category_badge: "required",
	seasonal_featured_badge: "conditional",
	match_score: "conditional",
	boosted_treatment: "conditional",
	quick_apply: "required",
}
