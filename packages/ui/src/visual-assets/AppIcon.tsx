"use client"

import { Icon, type IconKey } from "../icons"

/**
 * <AppIcon> — ergonomic semantic wrapper over the canonical <Icon> primitive.
 *
 * Adds token-name sizes ("sm"/"md"/"lg"), className passthrough, and clearer
 * decorative/labelled semantics. Renders through <Icon>, so it honors the single
 * icon system (G30) and the Cloudinary delivery pipeline. <Icon> remains available
 * for the existing call sites; AppIcon is the recommended ergonomic API for new code.
 *
 *   <AppIcon name="benefit.housing" aria-hidden />
 *   <AppIcon name="action.save" aria-label="Save" size="sm" />
 */

const SIZE_MAP = { sm: 16, md: 20, lg: 24 } as const

export interface AppIconProps {
	name: IconKey
	/** Token size ("sm"=16, "md"=20, "lg"=24) or a raw 16|20|24. Default "lg". */
	size?: keyof typeof SIZE_MAP | 16 | 20 | 24
	className?: string
	/** Override CSS color for tinting (category pins etc.). */
	color?: string
	/** Force decorative (aria-hidden) even without an explicit aria-hidden. */
	decorative?: boolean
	"aria-label"?: string
	"aria-hidden"?: boolean
	title?: string
}

export function AppIcon({
	name,
	size = "lg",
	className,
	color,
	decorative,
	title,
	...rest
}: AppIconProps) {
	const px = typeof size === "number" ? size : SIZE_MAP[size]
	const hidden = decorative === true || rest["aria-hidden"] === true
	const ariaLabel = rest["aria-label"]
	return (
		<Icon
			name={name}
			size={px}
			className={className}
			color={color}
			aria-hidden={hidden}
			// When labelled, Icon uses `title` as the accessible name (title ?? entry.label).
			title={hidden ? undefined : (ariaLabel ?? title)}
		/>
	)
}
