/**
 * Compile-time completeness test for the illustration registry.
 * Runs under `tsc --noEmit` (package typecheck + CI), no runtime cost. If a
 * key is added to the union but not the registry (or vice-versa), the build
 * fails here.
 *
 * Lives under __type-tests__ so the canon-contract guardrail's repo-wide scans skip it.
 */
import {
	ILLUSTRATION_REGISTRY,
	type IllustrationKey,
} from "../illustrations"

type Expect<T extends true> = T
type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false

// The registry covers every illustration key — no missing, no extra.
export type _IllustrationRegistryComplete = Expect<
	Equal<keyof typeof ILLUSTRATION_REGISTRY, IllustrationKey>
>
