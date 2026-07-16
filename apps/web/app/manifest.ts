import type { MetadataRoute } from "next";

/**
 * Web App Manifest — makes Explore & Earn installable (PWA shell) and is the
 * foundation for the eventual native wrap.
 *
 * Next serves this at `/manifest.webmanifest` and auto-injects the
 * `<link rel="manifest">` for us (no manual tag needed in <head>).
 *
 * LOCALE: routing is `localePrefix: "as-needed"` with `defaultLocale: "en"`
 * (i18n/routing.ts) — the default locale carries NO path prefix, so `/` IS the
 * en start_url. The manifest is a single static document (no per-request
 * locale), so `start_url`/`scope` are kept at the unprefixed root, which is
 * correct for every current URL. When a second locale ships (e.g. `es` →
 * `/es/…`), give it its own installable entry by linking a locale-specific
 * manifest from that locale's layout; this root manifest stays the en default.
 *
 * THEME COLOR: a manifest can hold only ONE static `theme_color`, used for the
 * OS splash/task-switcher chrome. It is pinned to the LIGHT page base (Glacier
 * ice-white) to match the app's server default (`<html data-theme="light">`),
 * so the install splash matches first paint. The *dynamic* light/dark browser
 * chrome is handled by the `viewport.themeColor` media export in layout.tsx.
 */
export default function manifest(): MetadataRoute.Manifest {
	return {
		id: "/",
		name: "Explore & Earn",
		short_name: "Explore&Earn",
		description:
			"Discover lifestyle work opportunities — housing, meals, and pay included. Farm, maritime, remote, and seasonal.",
		start_url: "/?source=pwa",
		scope: "/",
		display: "standalone",
		display_override: ["standalone", "minimal-ui"],
		orientation: "portrait",
		dir: "ltr",
		lang: "en",
		categories: ["travel", "lifestyle", "business"],
		// Glacier day/night: ice-white page base (light) / cool graphite (splash bg).
		theme_color: "#EDF2F6",
		background_color: "#EDF2F6",
		icons: [
			// Purpose "any" — rounded Glacier tile with the PinMark motif.
			{
				src: "/icons/icon-192.png",
				sizes: "192x192",
				type: "image/png",
				purpose: "any",
			},
			{
				src: "/icons/icon-512.png",
				sizes: "512x512",
				type: "image/png",
				purpose: "any",
			},
			// Purpose "maskable" — full-bleed gradient, PinMark inside the safe zone
			// so Android adaptive masks (circle/squircle) never clip the mark.
			{
				src: "/icons/icon-maskable-192.png",
				sizes: "192x192",
				type: "image/png",
				purpose: "maskable",
			},
			{
				src: "/icons/icon-maskable-512.png",
				sizes: "512x512",
				type: "image/png",
				purpose: "maskable",
			},
		],
	};
}
