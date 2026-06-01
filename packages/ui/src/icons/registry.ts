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
 * INVARIANT: the category.* keys MUST mirror MARKETPLACE_CATEGORIES
 * (packages/contracts/src/enums.ts) exactly — farm | maritime | remote |
 * seasonal | mix. "lodge" is intentionally NOT a category (see note below).
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
	// category (visual lanes) — MUST match MARKETPLACE_CATEGORIES exactly.
	| "category.farm"
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
	// category.* MUST mirror MARKETPLACE_CATEGORIES (packages/contracts/src/enums.ts)
	// exactly: farm | maritime | remote | seasonal | mix.
	// "category.lodge" was REMOVED (founder-approved Option 1, 2026-05-31): lodge is
	// a setting/environment under Seasonal, NOT a top-level category. Do NOT re-add
	// lodge to category.*; a future lodge-specific visual must use a separate
	// namespace (e.g. environment.lodge / visual_lane.lodge), never category.*.
	// TODO(CI drift check): fail the build if the set of category.* icon keys
	// diverges from MARKETPLACE_CATEGORIES. Tracked as a PR #4 follow-up.
	"category.farm": { key: "category.farm", streamline: "barn / wheat / plant", placeholder: "🌾", label: "Farm / Orchard / Greenhouse" },
	"category.maritime": { key: "category.maritime", streamline: "anchor / boat / rope", placeholder: "⚓", label: "Maritime" },
	"category.remote": { key: "category.remote", streamline: "laptop / desk", placeholder: "💻", label: "Remote" },
	"category.seasonal": { key: "category.seasonal", streamline: "leaf / sun / calendar", placeholder: "🍂", label: "Seasonal" },
	"category.mix": { key: "category.mix", streamline: "compass / mixed", placeholder: "🧭", label: "Mixed" },

	"benefit.housing": { key: "benefit.housing", streamline: "home / cabin / house", placeholder: "🏠", label: "Housing — where will I sleep?" },
	"benefit.meals": { key: "benefit.meals", streamline: "fork-knife / food / meal", placeholder: "🍴", label: "Meals — what will I eat?" },
	"benefit.pay": { key: "benefit.pay", streamline: "dollar / money / compensation", placeholder: "💵", label: "Pay — what will I earn?" },
	"benefit.transport": { key: "benefit.transport", streamline: "van / shuttle", placeholder: "🚐", label: "Transport" },
	"benefit.wifi": { key: "benefit.wifi", streamline: "wifi / signal", placeholder: "📶", label: "Wi-Fi / Connectivity" },

	"trust.verified_host": { key: "trust.verified_host", streamline: "check-badge / verification", placeholder: "✅", label: "Verified Host (Self-Declared by Host)" },
	"trust.founding_host": { key: "trust.founding_host", streamline: "crown / founder", placeholder: "👑", label: "Founding Host" },
	"trust.featured_employer": { key: "trust.featured_employer", streamline: "medal / ribbon", placeholder: "🏅", label: "Featured Employer" },

	"status.featured": { key: "status.featured", streamline: "star", placeholder: "⭐", label: "Featured" },
	"status.seasonal": { key: "status.seasonal", streamline: "leaf / sun / calendar", placeholder: "🍃", label: "Seasonal" },
	"status.boosted": { key: "status.boosted", streamline: "rocket / arrow-up", placeholder: "🚀", label: "Boosted" },
	"status.match": { key: "status.match", streamline: "target / sparkle", placeholder: "🎯", label: "Match" },
	"status.success": { key: "status.success", streamline: "check", placeholder: "✔️", label: "Success" },
	"status.warning": { key: "status.warning", streamline: "triangle-alert", placeholder: "⚠️", label: "Warning" },
	"status.error": { key: "status.error", streamline: "no-entry / x-circle", placeholder: "⛔", label: "Error" },
	"status.info": { key: "status.info", streamline: "info-circle", placeholder: "ℹ️", label: "Info" },
	"status.pending": { key: "status.pending", streamline: "hourglass", placeholder: "⏳", label: "Pending" },
	"status.locked": { key: "status.locked", streamline: "lock", placeholder: "🔒", label: "Locked" },

	"action.apply": { key: "action.apply", streamline: "arrow / send", placeholder: "➤", label: "Apply" },
	"action.save": { key: "action.save", streamline: "heart", placeholder: "❤️", label: "Save" },
	"action.saved": { key: "action.saved", streamline: "bookmark-filled", placeholder: "🔖", label: "Saved" },
	"action.message": { key: "action.message", streamline: "chat / message", placeholder: "💬", label: "Messages" },
	"action.share": { key: "action.share", streamline: "share", placeholder: "🔗", label: "Share" },
	"action.like": { key: "action.like", streamline: "thumbs-up", placeholder: "👍", label: "Like" },
	"action.filter": { key: "action.filter", streamline: "filter / funnel", placeholder: "🗂️", label: "Filter" },
	"action.sort": { key: "action.sort", streamline: "sort / arrows", placeholder: "↕️", label: "Sort" },
	"action.search": { key: "action.search", streamline: "magnifier", placeholder: "🔍", label: "Search" },
	"action.more": { key: "action.more", streamline: "ellipsis", placeholder: "…", label: "More" },
	"action.close": { key: "action.close", streamline: "x / close", placeholder: "✕", label: "Close" },
	"action.back": { key: "action.back", streamline: "arrow-left", placeholder: "←", label: "Back" },
	"action.edit": { key: "action.edit", streamline: "pencil", placeholder: "✏️", label: "Edit" },
	"action.add": { key: "action.add", streamline: "plus", placeholder: "➕", label: "Add" },
	"action.check": { key: "action.check", streamline: "check", placeholder: "✓", label: "Check" },

	"nav.discover": { key: "nav.discover", streamline: "compass / explore", placeholder: "🧭", label: "Discover" },
	"nav.search": { key: "nav.search", streamline: "magnifier", placeholder: "🔍", label: "Search" },
	"nav.saved": { key: "nav.saved", streamline: "bookmark", placeholder: "🔖", label: "Saved" },
	"nav.applications": { key: "nav.applications", streamline: "clipboard / list", placeholder: "📋", label: "Applications" },
	"nav.messages": { key: "nav.messages", streamline: "chat", placeholder: "💬", label: "Messages" },
	"nav.profile": { key: "nav.profile", streamline: "user / profile", placeholder: "👤", label: "Profile" },
	"nav.notifications": { key: "nav.notifications", streamline: "bell", placeholder: "🔔", label: "Notifications" },
	"nav.settings": { key: "nav.settings", streamline: "gear", placeholder: "⚙️", label: "Settings" },
	"nav.map": { key: "nav.map", streamline: "map / navigation", placeholder: "🗺️", label: "Map" },
	"nav.host": { key: "nav.host", streamline: "user / profile", placeholder: "👤", label: "Host" },

	"mappin.location": { key: "mappin.location", streamline: "map-pin", placeholder: "📍", label: "Location" },
	"mappin.cluster": { key: "mappin.cluster", streamline: "map-pins / cluster", placeholder: "📌", label: "Map cluster" },
	"mappin.selected": { key: "mappin.selected", streamline: "map-pin-selected", placeholder: "📍", label: "Selected pin" },
	"mappin.user": { key: "mappin.user", streamline: "user-location", placeholder: "🔵", label: "Your location" },

	"analytics.views": { key: "analytics.views", streamline: "eye / views", placeholder: "👁️", label: "Views" },
	"analytics.applications": { key: "analytics.applications", streamline: "inbox / applications", placeholder: "📥", label: "Applications received" },
	"analytics.conversion": { key: "analytics.conversion", streamline: "bar-chart", placeholder: "📊", label: "Conversion" },
	"analytics.trending": { key: "analytics.trending", streamline: "line-chart-up", placeholder: "📈", label: "Trending" },
	"analytics.meter": { key: "analytics.meter", streamline: "gauge / meter", placeholder: "🎚️", label: "Meter" },

	"system.chevron": { key: "system.chevron", streamline: "chevron-right", placeholder: "›", label: "Chevron" },
	"system.external": { key: "system.external", streamline: "external-link", placeholder: "↗️", label: "External link" },
	"system.eye": { key: "system.eye", streamline: "eye", placeholder: "👁️", label: "Show" },
	"system.eye_off": { key: "system.eye_off", streamline: "eye-off", placeholder: "🙈", label: "Hide" },
	"system.camera": { key: "system.camera", streamline: "camera", placeholder: "📷", label: "Camera" },
	"system.upload": { key: "system.upload", streamline: "upload", placeholder: "⬆️", label: "Upload" },
	"system.calendar": { key: "system.calendar", streamline: "calendar", placeholder: "📅", label: "Calendar" },
	"system.clock": { key: "system.clock", streamline: "clock", placeholder: "🕐", label: "Time" },
	"system.phone": { key: "system.phone", streamline: "phone", placeholder: "📞", label: "Phone" },
	"system.email": { key: "system.email", streamline: "envelope", placeholder: "✉️", label: "Email" },
	"system.link": { key: "system.link", streamline: "link", placeholder: "🔗", label: "Link" },
	"system.lock": { key: "system.lock", streamline: "lock", placeholder: "🔒", label: "Lock" },
	"system.empty": { key: "system.empty", streamline: "empty-box", placeholder: "📭", label: "Empty" },
}

export function getIcon(key: IconKey): IconEntry {
	return ICON_REGISTRY[key]
}
