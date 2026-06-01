/**
 * Compile-time tests for the icon registry. These run under `tsc --noEmit`
 * (package typecheck + CI) and have no runtime cost. If the registry ever drifts
 * from the canonical taxonomy union, the build fails here.
 *
 * This file lives under __type-tests__ so the canon-contract guardrail's
 * repo-wide scans skip it.
 */
import {
	CANONICAL_ICON_KEYS,
	ICON_REGISTRY,
	getIcon,
	isCanonicalIconKey,
	type CanonicalIconKey,
	type DeprecatedIconKey,
	type IconKey,
} from "../registry"

type Expect<T extends true> = T
type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false

// 1) CANONICAL_ICON_KEYS lists EXACTLY the canonical union -- no missing, no extra.
export type _CanonicalListComplete = Expect<
	Equal<(typeof CANONICAL_ICON_KEYS)[number], CanonicalIconKey>
>

// 2) The registry is keyed by the full IconKey union (canonical + deprecated).
export type _RegistryKeysMatch = Expect<
	Equal<keyof typeof ICON_REGISTRY, IconKey>
>

// 3) Canonical and deprecated key spaces are disjoint.
export type _NoKeyOverlap = Expect<
	Equal<CanonicalIconKey & DeprecatedIconKey, never>
>

// 4) Runtime sanity: every canonical key is non-deprecated and resolvable; every
//    deprecated entry is flagged and points at a canonical key or null.
export const _runtimeChecks = (): boolean => {
	const canonicalOk = CANONICAL_ICON_KEYS.every(
		(k) => isCanonicalIconKey(k) && getIcon(k).key === k,
	)
	const deprecatedKeys: DeprecatedIconKey[] = [
		"category.lodge",
		"status.featured",
		"status.seasonal",
		"mappin.location",
		"nav.host",
	]
	const deprecatedOk = deprecatedKeys.every((k) => {
		const entry = getIcon(k)
		const target = entry.aliasOf
		return (
			entry.deprecated === true &&
			!isCanonicalIconKey(k) &&
			(target === null || isCanonicalIconKey(target))
		)
	})
	return canonicalOk && deprecatedOk
}
