"use client"

import type { CSSProperties } from "react"
import { useStreamlineSvg } from "./useStreamlineSvg"
import { getIllustration, type IllustrationKey } from "./illustrations"
import { ILLUSTRATION_SIZE, type IllustrationSize } from "./types"

/**
 * <AppIllustration> — Streamline Freehand spot art for empty states, onboarding,
 * heroes, success, and error surfaces.
 *
 * Renders the asset large inside a framed warm-paper "plate" (matching the
 * frame-not-filter photo language) so the black line art reads on any theme. The
 * shared loader scales the 24x24 source to fill and swaps black -> currentColor so
 * the ink follows the plate's token color.
 *
 * Illustrations are decorative by default (the adjacent heading carries meaning) →
 * aria-hidden. Pass `aria-label` to make one a meaningful standalone image.
 *
 *   <AppIllustration name="empty.savedListings" />
 *   <AppIllustration name="hero.discover" size="lg" framed={false} />
 */

export interface AppIllustrationProps {
	name: IllustrationKey
	/** Token size ("sm"64 / "md"88 / "lg"120 / "xl"160) or raw px. Default "md". */
	size?: IllustrationSize | number
	/** Wrap in the warm-paper plate (default true). */
	framed?: boolean
	className?: string
	"aria-label"?: string
	"aria-hidden"?: boolean
}

export function AppIllustration({
	name,
	size = "md",
	framed = true,
	className,
	...rest
}: AppIllustrationProps) {
	const entry = getIllustration(name)
	const px = typeof size === "number" ? size : ILLUSTRATION_SIZE[size]
	const svg = useStreamlineSvg(entry.cloudinaryId)

	const ariaLabel = rest["aria-label"]
	// Decorative by default; labelled => meaningful image.
	const hidden = ariaLabel ? false : (rest["aria-hidden"] ?? true)

	const glyphStyle: CSSProperties = {
		display: "block",
		width: "100%",
		height: "100%",
		lineHeight: 0,
	}

	const glyph = svg ? (
		<span aria-hidden style={glyphStyle} dangerouslySetInnerHTML={{ __html: svg }} />
	) : (
		// Placeholder plate footprint while loading or when no asset is wired yet.
		<span
			aria-hidden
			style={{ ...glyphStyle, borderRadius: "12%", background: "currentColor", opacity: 0.1 }}
		/>
	)

	const shared = {
		role: hidden ? undefined : ("img" as const),
		"aria-label": hidden ? undefined : ariaLabel,
		"aria-hidden": hidden || undefined,
		"data-illustration": name,
		className,
	}

	if (!framed) {
		return (
			<span
				{...shared}
				style={{
					display: "inline-flex",
					alignItems: "center",
					justifyContent: "center",
					width: px,
					height: px,
					maxWidth: "100%",
					color: "var(--text-secondary)",
					flexShrink: 0,
				}}
			>
				{glyph}
			</span>
		)
	}

	return (
		<span
			{...shared}
			style={{
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				boxSizing: "border-box",
				width: px,
				height: px,
				maxWidth: "100%",
				padding: Math.round(px * 0.18),
				borderRadius: "var(--radius-card)",
				background: "var(--color-paper)",
				border: "1px solid var(--border-soft)",
				color: "var(--text-secondary)",
				flexShrink: 0,
			}}
		>
			{glyph}
		</span>
	)
}
