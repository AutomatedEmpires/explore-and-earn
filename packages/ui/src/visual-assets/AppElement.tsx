"use client"

import type { CSSProperties } from "react"
import { useStreamlineSvg } from "./useStreamlineSvg"
import { getElement, type ElementKey } from "./elements"
import { ELEMENT_SIZE, type ElementSize } from "./types"

/**
 * <AppElement> — small decorative accent (sparkle, leaf, compass, divider…).
 *
 * Always decorative (aria-hidden) — elements never carry meaning. Streamline-backed
 * accents render the inline SVG (tinted via currentColor); css-primitive marks
 * (divider / corner / paper texture) render from pure CSS.
 *
 *   <AppElement name="accent.sparkle" color="var(--status-featured-fg)" />
 *   <AppElement name="mark.divider" />
 */

export interface AppElementProps {
	name: ElementKey
	/** Token size ("xs"12 / "sm"16 / "md"24 / "lg"40) or raw px. Default "md". */
	size?: ElementSize | number
	/** Tint color (defaults to currentColor / inherited). */
	color?: string
	className?: string
}

function cssPrimitiveStyle(name: ElementKey, px: number): CSSProperties {
	switch (name) {
		case "mark.divider":
			return {
				display: "block",
				width: "100%",
				height: 0,
				borderTop: "2px solid currentColor",
				borderRadius: "999px",
				opacity: 0.25,
			}
		case "mark.cornerAccent":
			return {
				display: "inline-block",
				width: px,
				height: px,
				borderTop: "2px solid currentColor",
				borderLeft: "2px solid currentColor",
				borderTopLeftRadius: "6px",
				opacity: 0.35,
			}
		case "mark.paperTexture":
			return {
				display: "block",
				width: "100%",
				height: "100%",
				backgroundImage: "radial-gradient(currentColor 0.5px, transparent 0.5px)",
				backgroundSize: "6px 6px",
				opacity: 0.05,
			}
		default:
			return { display: "inline-block", width: px, height: px }
	}
}

export function AppElement({ name, size = "md", color, className }: AppElementProps) {
	const entry = getElement(name)
	const px = typeof size === "number" ? size : ELEMENT_SIZE[size]
	// Always called (returns null for css-primitive entries, which have no cloudinaryId).
	const svg = useStreamlineSvg(entry.cloudinaryId)

	const colorStyle = color ? { color } : undefined

	if (entry.source === "css-primitive") {
		return (
			<span
				aria-hidden
				data-element={name}
				className={className}
				style={{ ...cssPrimitiveStyle(name, px), ...colorStyle }}
			/>
		)
	}

	const baseStyle: CSSProperties = {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		width: px,
		height: px,
		flexShrink: 0,
		lineHeight: 0,
		...colorStyle,
	}

	if (svg) {
		return (
			<span
				aria-hidden
				data-element={name}
				className={className}
				style={baseStyle}
				dangerouslySetInnerHTML={{ __html: svg }}
			/>
		)
	}

	// Placeholder footprint while loading.
	return (
		<span
			aria-hidden
			data-element={name}
			className={className}
			style={{ ...baseStyle, borderRadius: "30%", background: "currentColor", opacity: 0.12 }}
		/>
	)
}
