/**
 * Shared types for the Explore&Earn visual-asset system.
 *
 * One icon family (Phosphor, via ../icons), rendered locally — no runtime
 * fetching, no third-party asset licensing. Illustrations are large framed
 * "plate" renderings of registry glyphs used for empty states, onboarding,
 * success moments, and error surfaces.
 */

/** Illustration size scale (px). Components clamp responsively to these. */
export const ILLUSTRATION_SIZE = {
	sm: 64,
	md: 88,
	lg: 120,
	xl: 160,
} as const
export type IllustrationSize = keyof typeof ILLUSTRATION_SIZE

/**
 * A registered illustration. `K` is the registry's key union so each entry's
 * `key` is type-checked against the registry it belongs to.
 */
export interface VisualAssetEntry<K extends string> {
	/** Stable semantic key — never rename once referenced. */
	key: K
	/** Human-readable label (also used for aria-label fallbacks). */
	label: string
	/** What this asset is for / where it's used. */
	description: string
	/** Taxonomy bucket (e.g. "empty state", "onboarding", "hero", "error"). */
	category: string
	/** Registry icon rendered large inside the plate. */
	icon: string
	/** Search keywords for registry tooling. */
	keywords: readonly string[]
	/** Decorative by default; meaningful instances pass an explicit aria-label. */
	decorative?: boolean
}
