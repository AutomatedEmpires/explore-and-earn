import { getIcon, type IconKey } from "./registry"

/**
 * <Icon> — the ONLY sanctioned way to render an icon in Explore&Earn.
 *
 * Renders from the Streamline Freehand registry by stable key. Until licensed
 * Streamline assets are wired in (founder approval gate A-ICON-LICENSE), this
 * renders a placeholder glyph plus a data-icon attribute so the intended icon
 * is traceable and swappable.
 *
 * Do NOT import lucide-react / heroicons / react-icons / font-awesome / mui
 * icons, and do NOT hand-roll inline <svg> in feature code. CI guardrail G30
 * enforces this. See docs/design/icon-system.md.
 *
 * TODO(A-ICON-LICENSE): replace placeholder rendering with licensed Streamline
 * Freehand assets (see docs/design/streamline-freehand-map.md).
 */
export interface IconProps {
	name: IconKey
	/** 16 | 20 | 24 per tokens; chip sizes 36/40 handled by container. */
	size?: 16 | 20 | 24
	"aria-hidden"?: boolean
	title?: string
}

export function Icon({ name, size = 24, title, ...rest }: IconProps) {
	const entry = getIcon(name)
	const label = title ?? entry.label
	const hidden = rest["aria-hidden"]
	return (
		<span
			role="img"
			aria-label={hidden ? undefined : label}
			aria-hidden={hidden}
			data-icon={name}
			data-streamline={entry.streamline}
			style=
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				width: size,
				height: size,
				fontSize: size,
				lineHeight: 1,
			
		>
			{/* TODO(A-ICON-LICENSE): swap placeholder for licensed Streamline Freehand asset */}
			{entry.placeholder}
		</span>
	)
}
