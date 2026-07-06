"use client"

import type { CSSProperties } from "react"

import { getIcon, type IconKey, type IconWeight } from "./registry"

/**
 * <Icon> — the ONLY sanctioned way to render an icon in Explore&Earn.
 *
 * Resolves the stable `name` key through the registry and renders the mapped
 * Phosphor glyph synchronously (no runtime fetch, no client-side sanitizing, no
 * skeleton flash). Color tints via `currentColor` so the same glyph inherits
 * theme tokens — used by `mappin.*` for per-category accent colors.
 *
 * Customization (see registry.ts for the full contract):
 *   - global default weight  → DEFAULT_ICON_WEIGHT below
 *   - per-key default weight → the registry entry's `weight` (e.g. map pins)
 *   - per-call override      → pass `weight` / `size` / `color`
 *
 * Do NOT import lucide / heroicons / react-icons / font-awesome / mui icons, and
 * do NOT hand-roll inline <svg> in feature code. CI guardrail G30 enforces this.
 * See docs/design/icon-system.md.
 */

/** App-wide default weight — change here to restyle every icon at once. */
const DEFAULT_ICON_WEIGHT: IconWeight = "regular"

export interface IconProps {
	name: IconKey
	/**
	 * 16 | 20 | 24 per tokens in product UI; chip sizes 36/40 handled by the
	 * container. Arbitrary sizes are reserved for the AppIllustration plate,
	 * which renders registry glyphs large as spot art.
	 */
	size?: 16 | 20 | 24 | (number & {})
	/** Override the resolved weight for this one render (e.g. "fill" for active tabs). */
	weight?: IconWeight
	"aria-hidden"?: boolean
	title?: string
	/** Override color for tinting — used by mappin.* for category accent colors. */
	color?: string
	/** Optional class on the rendered svg (used by AppIcon to forward styling). */
	className?: string
}

export function Icon({ name, size = 24, weight, color, title, className, ...rest }: IconProps) {
	const entry = getIcon(name)
	const Glyph = entry.icon
	const hidden = rest["aria-hidden"]
	const label = title ?? entry.label

	// Keep icons from shrinking inside flex rows and align them with adjacent
	// text — the layout contract the previous <Icon> span provided.
	const style: CSSProperties = { flexShrink: 0, verticalAlign: "middle" }

	return (
		<Glyph
			size={size}
			weight={weight ?? entry.weight ?? DEFAULT_ICON_WEIGHT}
			color={color ?? "currentColor"}
			className={className}
			style={style}
			data-icon={name}
			role="img"
			aria-hidden={hidden}
			aria-label={hidden ? undefined : label}
		/>
	)
}
