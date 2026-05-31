/**
 * Streamline Freehand icon registry.
 *
 * SINGLE SOURCE OF TRUTH for product concept -> icon mapping.
 * Product code references STABLE registry keys (e.g. "benefit.housing"),
 * never raw icon names or other icon libraries. This is the indirection layer
 * that lets us swap the underlying icon source without touching feature code.
 *
 * Naming convention: "{domain}.{name}" (matches data-icon="{domain}.{name}").
 * Domains: category, benefit, mappin, trust, status, action, nav, analytics, system.
 *
 * IMPORTANT (public repo + licensing): do NOT commit paid/proprietary
 * Streamline asset files here. We map to Streamline Freehand icon *names* only.
 * Until licensed assets are wired in (see docs/design/icon-system.md and
 * docs/design/streamline-freehand-map.md), <Icon> renders a placeholder.
 * Founder approval gate: A-ICON-LICENSE.
 */

export type IconKey =
	// category (visual lanes)
	| "category.farm"
	| "category.lodge"
	| "category.maritime"
	| "category.remote"
	// benefit triad
	| "benefit.housing"
	| "benefit.meals"
	| "benefit.pay"
	// trust
	| "trust.verifiedHost"
	// status / badges
	| "status.featured"
	| "status.seasonal"
	| "status.boosted"
	| "status.match"
	// actions
	| "action.apply"
	| "action.save"
	| "action.message"
	// nav / location
	| "nav.map"
	| "mappin.location"
	| "nav.host"

/**
 * Maps a stable registry key to a Streamline Freehand icon name (concept).
 * `streamline` is the intended Freehand icon (or family) per
 * docs/design/streamline-freehand-map.md. `placeholder` is the inline glyph
 * used until licensed assets are wired in.
 */
export interface IconEntry {
	/** Stable key used throughout the app. */
	key: IconKey
	/** Intended Streamline Freehand icon name/concept (not an asset path). */
	streamline: string
	/** Temporary placeholder glyph (emoji/text) until assets land. */
	placeholder: string
	/** Human label for a11y + docs. */
	label: string
}

export const ICON_REGISTRY: Record<IconKey, IconEntry> = {
	"category.farm": { key: "category.farm", streamline: "barn / wheat / plant", placeholder: "\u{1F33E}", label: "Farm / Orchard / Greenhouse" },
	"category.lodge": { key: "category.lodge", streamline: "cabin / mountain", placeholder: "\u{1F3D4}", label: "Seasonal Lodge / Outdoor" },
	"category.maritime": { key: "category.maritime", streamline: "anchor / boat / rope", placeholder: "\u{2693}", label: "Maritime" },
	"category.remote": { key: "category.remote", streamline: "laptop / desk", placeholder: "\u{1F4BB}", label: "Remote" },

	"benefit.housing": { key: "benefit.housing", streamline: "home / cabin / house", placeholder: "\u{1F3E0}", label: "Housing — where will I sleep?" },
	"benefit.meals": { key: "benefit.meals", streamline: "fork-knife / food / meal", placeholder: "\u{1F374}", label: "Meals — what will I eat?" },
	"benefit.pay": { key: "benefit.pay", streamline: "dollar / money / compensation", placeholder: "\u{1F4B5}", label: "Pay — what will I earn?" },

	"trust.verifiedHost": { key: "trust.verifiedHost", streamline: "check-badge / verification", placeholder: "\u{2705}", label: "Verified Host (Self-Declared by Host)" },

	"status.featured": { key: "status.featured", streamline: "star", placeholder: "\u{2B50}", label: "Featured" },
	"status.seasonal": { key: "status.seasonal", streamline: "leaf / sun / calendar", placeholder: "\u{1F343}", label: "Seasonal" },
	"status.boosted": { key: "status.boosted", streamline: "rocket / arrow-up", placeholder: "\u{1F680}", label: "Boosted" },
	"status.match": { key: "status.match", streamline: "target / sparkle", placeholder: "\u{1F3AF}", label: "Match" },

	"action.apply": { key: "action.apply", streamline: "arrow / send", placeholder: "\u{27A4}", label: "Apply" },
	"action.save": { key: "action.save", streamline: "heart", placeholder: "\u{2764}", label: "Save" },
	"action.message": { key: "action.message", streamline: "chat / message", placeholder: "\u{1F4AC}", label: "Messages" },

	"nav.map": { key: "nav.map", streamline: "map / navigation", placeholder: "\u{1F5FA}", label: "Map" },
	"mappin.location": { key: "mappin.location", streamline: "map-pin", placeholder: "\u{1F4CD}", label: "Location" },
	"nav.host": { key: "nav.host", streamline: "user / profile", placeholder: "\u{1F464}", label: "Host" },
}

export function getIcon(key: IconKey): IconEntry {
	return ICON_REGISTRY[key]
}
