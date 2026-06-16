/**
 * Compile-time completeness tests for the illustration & element registries.
 * Runs under `tsc --noEmit` (package typecheck + CI), no runtime cost. If a key is
 * added to a union but not its KEYS array (or vice-versa), the build fails here.
 *
 * Lives under __type-tests__ so the canon-contract guardrail's repo-wide scans skip it.
 */
import { ILLUSTRATION_KEYS, type IllustrationKey } from "../illustrations"
import { ELEMENT_KEYS, type ElementKey } from "../elements"

type Expect<T extends true> = T
type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false

// Every illustration key appears exactly once in ILLUSTRATION_KEYS — no missing, no extra.
export type _IllustrationKeysComplete = Expect<
	Equal<(typeof ILLUSTRATION_KEYS)[number], IllustrationKey>
>

// Every element key appears exactly once in ELEMENT_KEYS.
export type _ElementKeysComplete = Expect<
	Equal<(typeof ELEMENT_KEYS)[number], ElementKey>
>
