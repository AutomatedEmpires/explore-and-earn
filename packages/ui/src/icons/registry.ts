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
 *
 * NOTE: keys below are PLACEHOLDERS pending the Icon & Illustration Manifest
 * final cut. Glyphs are temporary; real assets land behind A-ICON-LICENSE.
 */

export type IconKey =
	// category (visual lanes)
	| "category.farm"
	| "category.lodge"
	| "category.maritime"
	| "category.remote"
	| "category.seasonal"
	| "category.mix"
	// benefit triad (+ secondary benefits)
	| "benefit.housing"
	| "benefit.meals"
	| "benefit.pay"
	| "benefit.transport"
	| "benefit.wifi"
	// trust
	| "trust.verified_host"
	| "trust.founding_host"
	| "trust.featured_employer"
	// status / badges
	| "status.featured"
	| "status.seasonal"
	| "status.boosted"
	| "status.match"
	| "status.success"
	| "status.warning"
	| "status.error"
	| "status.info"
	| "status.pending"
	| "status.locked"
	// actions
	| "action.apply"
	| "action.save"
	| "action.saved"
	| "action.message"
	| "action.share"
	| "action.like"
	| "action.filter"
	| "action.sort"
	| "action.search"
	| "action.more"
	| "action.close"
	| "action.back"
	| "action.edit"
	| "action.add"
	| "action.check"
	// nav
	| "nav.discover"
	| "nav.search"
	| "nav.saved"
	| "nav.applications"
	| "nav.messages"
	| "nav.profile"
	| "nav.notifications"
	| "nav.settings"
	| "nav.map"
	| "nav.host"
	// map pins / location
	| "mappin.location"
	| "mappin.cluster"
	| "mappin.selected"
	| "mappin.user"
	// analytics
	| "analytics.views"
	| "analytics.applications"
	| "analytics.conversion"
	| "analytics.trending"
	| "analytics.meter"
	// system / utility
	| "system.chevron"
	| "system.external"
	| "system.eye"
	| "system.eye_off"
	| "system.camera"
	| "system.upload"
	| "system.calendar"
	| "system.clock"
	| "system.phone"
	| "system.email"
	| "system.link"
	| "system.lock"
	| "system.empty"

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
	"category.farm": { key: "category.farm", streamline: "barn / wheat / plant", placeholder: "\\u{1F33E}", label: "Farm / Orchard / Greenhouse" },
	// TODO(?): DRIFT — "category.lodge" is not in the canonical category enum
	// (farm/maritime/remote/seasonal/mix). Reconcile vs Canonical Enum Registry
	// (founder gate). Kept for now to avoid breaking consumers.
	"category.lodge": { key: "category.lodge", streamline: "cabin / mountain", placeholder: "\\u{1F3D4}", label: "Seasonal Lodge / Outdoor" },
	"category.maritime": { key: "category.maritime", streamline: "anchor / boat / rope", placeholder: "\\u{2693}", label: "Maritime" },
	"category.remote": { key: "category.remote", streamline: "laptop / desk", placeholder: "\\u{1F4BB}", label: "Remote" },
	"category.seasonal": { key: "category.seasonal", streamline: "leaf / sun / calendar", placeholder: "\\u{1F342}", label: "Seasonal" },
	"category.mix": { key: "category.mix", streamline: "compass / mixed", placeholder: "\\u{1F9ED}", label: "Mixed" },

	"benefit.housing": { key: "benefit.housing", streamline: "home / cabin / house", placeholder: "\\u{1F3E0}", label: "Housing — where will I sleep?" },
	"benefit.meals": { key: "benefit.meals", streamline: "fork-knife / food / meal", placeholder: "\\u{1F374}", label: "Meals — what will I eat?" },
	"benefit.pay": { key: "benefit.pay", streamline: "dollar / money / compensation", placeholder: "\\u{1F4B5}", label: "Pay — what will I earn?" },
	"benefit.transport": { key: "benefit.transport", streamline: "van / shuttle", placeholder: "\\u{1F690}", label: "Transport" },
	"benefit.wifi": { key: "benefit.wifi", streamline: "wifi / signal", placeholder: "\\u{1F4F6}", label: "Wi-Fi / Connectivity" },

	"trust.verified_host": { key: "trust.verified_host", streamline: "check-badge / verification", placeholder: "\\u{2705}", label: "Verified Host (Self-Declared by Host)" },
	"trust.founding_host": { key: "trust.founding_host", streamline: "crown / founder", placeholder: "\\u{1F451}", label: "Founding Host" },
	"trust.featured_employer": { key: "trust.featured_employer", streamline: "medal / ribbon", placeholder: "\\u{1F3C5}", label: "Featured Employer" },

	"status.featured": { key: "status.featured", streamline: "star", placeholder: "\\u{2B50}", label: "Featured" },
	"status.seasonal": { key: "status.seasonal", streamline: "leaf / sun / calendar", placeholder: "\\u{1F343}", label: "Seasonal" },
	"status.boosted": { key: "status.boosted", streamline: "rocket / arrow-up", placeholder: "\\u{1F680}", label: "Boosted" },
	"status.match": { key: "status.match", streamline: "target / sparkle", placeholder: "\\u{1F3AF}", label: "Match" },
	"status.success": { key: "status.success", streamline: "check", placeholder: "\\u{2714}", label: "Success" },
	"status.warning": { key: "status.warning", streamline: "triangle-alert", placeholder: "\\u{26A0}", label: "Warning" },
	"status.error": { key: "status.error", streamline: "no-entry / x-circle", placeholder: "\\u{26D4}", label: "Error" },
	"status.info": { key: "status.info", streamline: "info-circle", placeholder: "\\u{2139}", label: "Info" },
	"status.pending": { key: "status.pending", streamline: "hourglass", placeholder: "\\u{23F3}", label: "Pending" },
	"status.locked": { key: "status.locked", streamline: "lock", placeholder: "\\u{1F512}", label: "Locked" },

	"action.apply": { key: "action.apply", streamline: "arrow / send", placeholder: "\\u{27A4}", label: "Apply" },
	"action.save": { key: "action.save", streamline: "heart", placeholder: "\\u{2764}", label: "Save" },
	"action.saved": { key: "action.saved", streamline: "bookmark-filled", placeholder: "\\u{1F516}", label: "Saved" },
	"action.message": { key: "action.message", streamline: "chat / message", placeholder: "\\u{1F4AC}", label: "Messages" },
	"action.share": { key: "action.share", streamline: "share", placeholder: "\\u{1F517}", label: "Share" },
	"action.like": { key: "action.like", streamline: "thumbs-up", placeholder: "\\u{1F44D}", label: "Like" },
	"action.filter": { key: "action.filter", streamline: "filter / funnel", placeholder: "\\u{1F5C2}", label: "Filter" },
	"action.sort": { key: "action.sort", streamline: "sort / arrows", placeholder: "\\u{2195}", label: "Sort" },
	"action.search": { key: "action.search", streamline: "magnifier", placeholder: "\\u{1F50D}", label: "Search" },
	"action.more": { key: "action.more", streamline: "ellipsis", placeholder: "\\u{2026}", label: "More" },
	"action.close": { key: "action.close", streamline: "x / close", placeholder: "\\u{2715}", label: "Close" },
	"action.back": { key: "action.back", streamline: "arrow-left", placeholder: "\\u{2190}", label: "Back" },
	"action.edit": { key: "action.edit", streamline: "pencil", placeholder: "\\u{270F}", label: "Edit" },
	"action.add": { key: "action.add", streamline: "plus", placeholder: "\\u{2795}", label: "Add" },
	"action.check": { key: "action.check", streamline: "check", placeholder: "\\u{2713}", label: "Check" },

	"nav.discover": { key: "nav.discover", streamline: "compass / explore", placeholder: "\\u{1F9ED}", label: "Discover" },
	"nav.search": { key: "nav.search", streamline: "magnifier", placeholder: "\\u{1F50D}", label: "Search" },
	"nav.saved": { key: "nav.saved", streamline: "bookmark", placeholder: "\\u{1F516}", label: "Saved" },
	"nav.applications": { key: "nav.applications", streamline: "clipboard / list", placeholder: "\\u{1F4CB}", label: "Applications" },
	"nav.messages": { key: "nav.messages", streamline: "chat", placeholder: "\\u{1F4AC}", label: "Messages" },
	"nav.profile": { key: "nav.profile", streamline: "user / profile", placeholder: "\\u{1F464}", label: "Profile" },
	"nav.notifications": { key: "nav.notifications", streamline: "bell", placeholder: "\\u{1F514}", label: "Notifications" },
	"nav.settings": { key: "nav.settings", streamline: "gear", placeholder: "\\u{2699}", label: "Settings" },
	"nav.map": { key: "nav.map", streamline: "map / navigation", placeholder: "\\u{1F5FA}", label: "Map" },
	"nav.host": { key: "nav.host", streamline: "user / profile", placeholder: "\\u{1F464}", label: "Host" },

	"mappin.location": { key: "mappin.location", streamline: "map-pin", placeholder: "\\u{1F4CD}", label: "Location" },
	"mappin.cluster": { key: "mappin.cluster", streamline: "map-pins / cluster", placeholder: "\\u{1F4CC}", label: "Map cluster" },
	"mappin.selected": { key: "mappin.selected", streamline: "map-pin-selected", placeholder: "\\u{1F4CD}", label: "Selected pin" },
	"mappin.user": { key: "mappin.user", streamline: "user-location", placeholder: "\\u{1F535}", label: "Your location" },

	"analytics.views": { key: "analytics.views", streamline: "eye / views", placeholder: "\\u{1F441}", label: "Views" },
	"analytics.applications": { key: "analytics.applications", streamline: "inbox / applications", placeholder: "\\u{1F4E5}", label: "Applications received" },
	"analytics.conversion": { key: "analytics.conversion", streamline: "bar-chart", placeholder: "\\u{1F4CA}", label: "Conversion" },
	"analytics.trending": { key: "analytics.trending", streamline: "line-chart-up", placeholder: "\\u{1F4C8}", label: "Trending" },
	"analytics.meter": { key: "analytics.meter", streamline: "gauge / meter", placeholder: "\\u{1F39A}", label: "Meter" },

	"system.chevron": { key: "system.chevron", streamline: "chevron-right", placeholder: "\\u{203A}", label: "Chevron" },
	"system.external": { key: "system.external", streamline: "external-link", placeholder: "\\u{2197}", label: "External link" },
	"system.eye": { key: "system.eye", streamline: "eye", placeholder: "\\u{1F441}", label: "Show" },
	"system.eye_off": { key: "system.eye_off", streamline: "eye-off", placeholder: "\\u{1F648}", label: "Hide" },
	"system.camera": { key: "system.camera", streamline: "camera", placeholder: "\\u{1F4F7}", label: "Camera" },
	"system.upload": { key: "system.upload", streamline: "upload", placeholder: "\\u{2B06}", label: "Upload" },
	"system.calendar": { key: "system.calendar", streamline: "calendar", placeholder: "\\u{1F4C5}", label: "Calendar" },
	"system.clock": { key: "system.clock", streamline: "clock", placeholder: "\\u{1F550}", label: "Time" },
	"system.phone": { key: "system.phone", streamline: "phone", placeholder: "\\u{1F4DE}", label: "Phone" },
	"system.email": { key: "system.email", streamline: "envelope", placeholder: "\\u{2709}", label: "Email" },
	"system.link": { key: "system.link", streamline: "link", placeholder: "\\u{1F517}", label: "Link" },
	"system.lock": { key: "system.lock", streamline: "lock", placeholder: "\\u{1F512}", label: "Lock" },
	"system.empty": { key: "system.empty", streamline: "empty-box", placeholder: "\\u{1F4ED}", label: "Empty" },
}

export function getIcon(key: IconKey): IconEntry {
	return ICON_REGISTRY[key]
}
