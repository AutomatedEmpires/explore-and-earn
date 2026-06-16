/**
 * Shared types for the Explore&Earn visual-asset system.
 *
 * Three layers, one Streamline Freehand family, one Cloudinary delivery pipeline:
 *   - icons        -> ../icons (established CI-enforced home; <Icon>/<AppIcon>)
 *   - illustrations -> ./illustrations (spot art; <AppIllustration>)
 *   - elements      -> ./elements (decorative accents; <AppElement>)
 *
 * Every `cloudinaryId` MUST reference a real asset in the `explore-and-earn/icons`
 * Cloudinary folder (see docs/design/streamline-cloudinary-inventory.md). Entries
 * without a cloudinaryId render a neutral placeholder — they are intentional, named
 * gaps, never faked assets. CSS-primitive entries (source: "css-primitive") are not
 * Streamline assets and render from pure CSS.
 */

/** Illustration size scale (px). Components clamp responsively to these. */
export const ILLUSTRATION_SIZE = {
	sm: 64,
	md: 88,
	lg: 120,
	xl: 160,
} as const
export type IllustrationSize = keyof typeof ILLUSTRATION_SIZE

/** Element (small accent) size scale (px). */
export const ELEMENT_SIZE = {
	xs: 12,
	sm: 16,
	md: 24,
	lg: 40,
} as const
export type ElementSize = keyof typeof ELEMENT_SIZE

/** How an asset is delivered. */
export type AssetSource = "streamline" | "css-primitive"

/**
 * A registered visual asset (illustration or element). `K` is the registry's key union
 * so each entry's `key` is type-checked against the registry it belongs to.
 */
export interface VisualAssetEntry<K extends string> {
	/** Stable semantic key — never rename once referenced. */
	key: K
	/** Human-readable label (also used for aria-label fallbacks). */
	label: string
	/** What this asset is for / where it's used. */
	description: string
	/** Taxonomy bucket (e.g. "empty state", "onboarding", "hero", "accent"). */
	category: string
	/** Streamline Freehand concept hint used to source the glyph. */
	streamline: string
	/** Search keywords for registry tooling. */
	keywords: readonly string[]
	/**
	 * Cloudinary public ID of the real SVG (folder explore-and-earn/icons).
	 * undefined => no asset wired yet; component renders a placeholder plate.
	 */
	cloudinaryId?: string
	/** Delivery mechanism. Defaults to "streamline" when omitted. */
	source?: AssetSource
	/** Decorative by default; meaningful instances pass an explicit aria-label. */
	decorative?: boolean
}
