"use client"

import { useEffect, useState } from "react"
import DOMPurify from "dompurify"
import type { Config as DOMPurifyConfig } from "dompurify"
import { CLOUDINARY_ICON_BASE } from "../icons/registry"

/**
 * Shared Cloudinary inline-SVG loader for AppIllustration / AppElement.
 *
 * Mirrors the proven approach in Icon.tsx (fetch -> DOMPurify-sanitize -> inline so
 * the glyph participates in the DOM), then adds two normalizations the larger asset
 * layers need:
 *   1. SCALE: the source SVGs are intrinsically 24x24. We rewrite the root <svg>
 *      width/height to 100% so the glyph fills its container (icons render at 24;
 *      illustrations must scale up to 64-160px).
 *   2. TINT: the processed assets ship with hardcoded fill="#000000" (not
 *      currentColor), so CSS `color` cannot tint them as-is. We swap black -> currentColor
 *      so the asset inherits token-driven color (muted ink on a paper plate, gold accents,
 *      dark-mode safety). Icon.tsx is intentionally left unchanged.
 */

// SVG-safe DOMPurify config: allow SVG, strip scripts and external refs.
const PURIFY_CONFIG: DOMPurifyConfig = {
	USE_PROFILES: { svg: true, svgFilters: true },
	FORBID_TAGS: ["script", "use"],
	FORBID_ATTR: ["xlink:href", "href"],
}

// Module-level cache shared by all AppIllustration/AppElement instances.
// Keyed by cloudinaryId. "" = fetch failed; skip retry, show placeholder.
const _svgCache = new Map<string, string>()

/** Build the Cloudinary delivery URL for a public ID (same folder as icons). */
export function streamlineUrl(cloudinaryId: string): string {
	return `${CLOUDINARY_ICON_BASE}/${cloudinaryId}`
}

/** Rewrite the root <svg> width/height to 100% so the glyph fills its box. */
function fillContainer(svg: string): string {
	return svg
		.replace(/(<svg\b[^>]*?)\swidth="[^"]*"/i, "$1 width=\"100%\"")
		.replace(/(<svg\b[^>]*?)\sheight="[^"]*"/i, "$1 height=\"100%\"")
}

/** Swap hardcoded black fills/strokes for currentColor so CSS `color` tints the asset. */
function tintToCurrentColor(svg: string): string {
	return svg.replace(/(fill|stroke)="#000(?:000)?"/gi, "$1=\"currentColor\"")
}

function process(raw: string): string {
	const clean = DOMPurify.sanitize(raw, PURIFY_CONFIG) as string
	return tintToCurrentColor(fillContainer(clean))
}

export function useStreamlineSvg(cloudinaryId: string | undefined): string | null {
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
		fetch(streamlineUrl(cloudinaryId))
			.then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
			.then((text) => {
				const processed = process(text)
				_svgCache.set(cloudinaryId, processed)
				setSvg(processed)
			})
			.catch(() => {
				_svgCache.set(cloudinaryId, "")
			})
	}, [cloudinaryId])

	return svg
}
