/**
 * Compile-time tests for the typed token contract. Run under `tsc --noEmit`
 * (package typecheck + CI); zero runtime cost. They fail the build if the token
 * contract drifts from itself or from the icon registry's category taxonomy.
 *
 * Lives under __type-tests__ so canon-contract guardrail scans skip it.
 */
import {
	BENEFIT_ACCENTS,
	BENEFIT_KEYS,
	CATEGORY_ACCENTS,
	CATEGORY_KEYS,
	COMPONENT_STATES,
	STATUS_ACCENTS,
	STATUS_ACCENT_KEYS,
	cssVar,
	type BenefitKey,
	type CategoryKey,
	type ComponentState,
	type StatusAccentKey,
} from "../tokens"
import type { CanonicalIconKey } from "../icons/registry"

type Expect<T extends true> = T
type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false

/** Distributive suffix extraction over a string-literal union. */
type SuffixOf<T extends string, P extends string> = T extends `${P}${infer R}`
	? R
	: never

// 1) Key tuples match their unions (no missing / extra).
export type _CategoryList = Expect<Equal<(typeof CATEGORY_KEYS)[number], CategoryKey>>
export type _BenefitList = Expect<Equal<(typeof BENEFIT_KEYS)[number], BenefitKey>>
export type _StatusList = Expect<Equal<(typeof STATUS_ACCENT_KEYS)[number], StatusAccentKey>>
export type _StatesList = Expect<Equal<(typeof COMPONENT_STATES)[number], ComponentState>>

// 2) Accent maps are exhaustive over their key unions.
export type _CategoryAccentsExhaustive = Expect<Equal<keyof typeof CATEGORY_ACCENTS, CategoryKey>>
export type _BenefitAccentsExhaustive = Expect<Equal<keyof typeof BENEFIT_ACCENTS, BenefitKey>>
export type _StatusAccentsExhaustive = Expect<Equal<keyof typeof STATUS_ACCENTS, StatusAccentKey>>

// 3) Cross-canon: category accents stay in lockstep with the icon registry's
//    `category.*` domain. If either side adds/removes a lane, this breaks.
type IconCategoryKey = SuffixOf<CanonicalIconKey, "category.">
export type _CategoryAlignedWithIcons = Expect<Equal<CategoryKey, IconCategoryKey>>

// 4) The benefit triad is a subset of the icon registry's `benefit.*` domain
//    (icons also cover transport/wifi; accent tokens are triad-only by canon).
type IconBenefitKey = SuffixOf<CanonicalIconKey, "benefit.">
export type _BenefitTriadIsIconSubset = Expect<
	BenefitKey extends IconBenefitKey ? true : false
>

// 5) Runtime sanity: cssVar wraps correctly and every accent pair is var-shaped.
export const _runtimeChecks = (): boolean => {
	const wrapped = cssVar("--color-surface") === "var(--color-surface)"
	const cats = CATEGORY_KEYS.every(
		(k) => CATEGORY_ACCENTS[k].bg.startsWith("--") && CATEGORY_ACCENTS[k].fg.startsWith("--"),
	)
	const bens = BENEFIT_KEYS.every(
		(k) => BENEFIT_ACCENTS[k].bg.startsWith("--") && BENEFIT_ACCENTS[k].fg.startsWith("--"),
	)
	const stats = STATUS_ACCENT_KEYS.every(
		(k) => STATUS_ACCENTS[k].bg.startsWith("--") && STATUS_ACCENTS[k].fg.startsWith("--"),
	)
	return wrapped && cats && bens && stats
}
