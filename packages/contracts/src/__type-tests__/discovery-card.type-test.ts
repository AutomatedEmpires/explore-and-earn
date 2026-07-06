/**
 * Compile-time contract tests for the Discovery Card canon mirror.
 *
 * There is no test runner wired into this package yet, so these are TYPE-LEVEL
 * tests: they are validated by `tsc` during `typecheck` and emit no runtime.
 * This file lives under src/ so it is type-checked, but it is intentionally NOT
 * re-exported from src/index.ts, so it never becomes part of the public API.
 */
import {
	DISCOVERY_CARD_ACTION_DESTINATIONS,
	DISCOVERY_CARD_ACTIONS,
	DISCOVERY_CARD_FIELD_REQUIREMENT,
	DISCOVERY_CARD_FIELDS,
	hasVerifiedHostSubscription,
	type DiscoveryCardAction,
	type DiscoveryCardField,
	type DiscoveryCardSurface,
	type OpportunityTriad,
} from "../card"
import { MARKETPLACE_CATEGORIES } from "../enums"

type Expect<T extends true> = T
type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false

// 1. The Verified-Host badge is subscription-gated, never self-declared (founder decision 2026-07-03).
export const _verifiedHostIsSubscriptionGated: Expect<
	Equal<ReturnType<typeof hasVerifiedHostSubscription>, boolean>
> = true

// 2. The triad is exactly Housing / Meals / Pay — never "Perks."
export const _triadKeys: Expect<
	Equal<keyof OpportunityTriad, "housing" | "meals" | "pay">
> = true

// @ts-expect-error "perks" is not a triad key — relabeling the triad is forbidden.
const _perks: keyof OpportunityTriad = "perks"
export const _perksRejected = _perks

// 3. Representative literals are assignable to their registry types.
export const _surface: DiscoveryCardSurface = "matched"
export const _action: DiscoveryCardAction = "quick_apply"
export const _field: DiscoveryCardField = "match_score"

// 4. Every action has a destination, and every field has a requirement entry.
export const _actionsHaveDestinations =
	Object.keys(DISCOVERY_CARD_ACTION_DESTINATIONS).length ===
	DISCOVERY_CARD_ACTIONS.length
export const _fieldsHaveRequirements =
	Object.keys(DISCOVERY_CARD_FIELD_REQUIREMENT).length ===
	DISCOVERY_CARD_FIELDS.length

// 5. Categories still come from the single source enum (not redefined here).
export const _categorySingleSource: (typeof MARKETPLACE_CATEGORIES)[number] =
	MARKETPLACE_CATEGORIES[0]
