import { useEffect, useState } from "react"
import DOMPurify from "dompurify"
import type { Config as DOMPurifyConfig } from "dompurify"
import { getIcon, getIconUrl, type IconKey } from "./registry"
import type { CSSProperties } from "react"

// SVG-safe DOMPurify config: allow SVG elements/attrs, strip scripts and externals.
const PURIFY_CONFIG: DOMPurifyConfig = {
	USE_PROFILES: { svg: true, svgFilters: true },
	FORBID_TAGS: ["script", "use"],
	FORBID_ATTR: ["xlink:href", "href"],
}

/**
 * <Icon> — the ONLY sanctioned way to render an icon in Explore&Earn.
 *
 * Resolves the stable `name` key through the Streamline Freehand registry,
 * fetches the processed SVG from Cloudinary, and inlines it so that
 * `currentColor` / CSS `color` tinting works (critical for mappin.* pins).
 *
 * Falls back to the emoji placeholder while the asset is loading or when no
 * Cloudinary asset has been uploaded yet (keys without `cloudinaryId`).
 *
 * Do NOT import lucide-react / heroicons / react-icons / font-awesome / mui
 * icons, and do NOT hand-roll inline <svg> in feature code. CI guardrail G30
 * enforces this. See docs/design/icon-system.md.
 */

// Module-level SVG cache — shared across all Icon instances, survives re-renders.
// Keyed by Cloudinary public ID. "" = fetch failed; skip retry, show placeholder.
const _svgCache = new Map<string, string>()

function useIconSvg(cloudinaryId: string | undefined): string | null {
	const [svg, setSvg] = useState<string | null>(() =>
		cloudinaryId != null ? (_svgCache.get(cloudinaryId) ?? null) : null,
	)

	useEffect(() => {
		if (cloudinaryId == null) return
		const cached = _svgCache.get(cloudinaryId)
		if (cached != null) {
			setSvg(cached)
			return
		}
		const url = getIconUrl({ cloudinaryId } as Parameters<typeof getIconUrl>[0])
		if (!url) return
		fetch(url)
			.then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
			.then((text) => {
				const clean = DOMPurify.sanitize(text, PURIFY_CONFIG) as string
				_svgCache.set(cloudinaryId, clean)
				setSvg(clean)
			})
			.catch(() => {
				_svgCache.set(cloudinaryId, "")
			})
	}, [cloudinaryId])

	return svg
}

export interface IconProps {
	name: IconKey
	/** 16 | 20 | 24 per tokens; chip sizes 36/40 handled by container. */
	size?: 16 | 20 | 24
	"aria-hidden"?: boolean
	title?: string
	/** Override CSS color for tinting — used by mappin.* for category accent colors. */
	color?: string
}

export function Icon({ name, size = 24, title, color, ...rest }: IconProps) {
	const entry = getIcon(name)
	const label = title ?? entry.label
	const hidden = rest["aria-hidden"]
	const svgText = useIconSvg(entry.cloudinaryId)

	const baseStyle: CSSProperties = {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		width: size,
		height: size,
		flexShrink: 0,
		...(color ? { color } : {}),
	}

	if (svgText) {
		return (
			<span
				role="img"
				aria-label={hidden ? undefined : label}
				aria-hidden={hidden}
				data-icon={name}
				style={{ ...baseStyle, lineHeight: 0 }}
				dangerouslySetInnerHTML={{ __html: svgText }}
			/>
		)
	}

	return (
		<span
			role="img"
			aria-label={hidden ? undefined : label}
			aria-hidden={hidden}
			data-icon={name}
			data-streamline={entry.streamline}
			style={{ ...baseStyle, fontSize: size, lineHeight: 1 }}
		>
			{entry.placeholder}
		</span>
	)
}
