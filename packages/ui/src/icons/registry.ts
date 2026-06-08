/**
 * Streamline Freehand icon registry.
 *
 * Single source of truth for every icon used in the product (guardrail G30 /
 * ADR-044). Components must render icons through the <Icon name="domain.name"/>
 * wrapper and never import from lucide / heroicons / font-awesome / material /
 * react-icons, and never inline ad-hoc SVG outside packages/ui/src/icons.
 *
 * v2 (expanded): this registry now mirrors the FULL founder-locked taxonomy from
 * docs/design/icon-system.md (locked 2026-05-31) and the concept mapping in
 * docs/design/streamline-freehand-map.md. Canonical keys span 9 domains:
 *   category, benefit, mappin, trust, status, action, nav, analytics, system.
 *
 * Licensing constraint: the repo is PUBLIC. We commit ONLY registry names plus
 * emoji placeholders and a `streamline` concept hint -- never paid Streamline
 * .svg/.png/.pdf asset files. The Streamline Freehand license caps usage at
 * ~100 distinct icons per project; exceeding it requires the Extended Vector
 * License (founder gate G30). This registry is intentionally < 100 keys.
 *
 * Asset delivery: processed SVGs are stored on Cloudinary as raw resources
 * (cloud: dwiwyt9vi, prefix: explore-and-earn/icons/{domain}/{name}).
 * Icon.tsx fetches and inlines them at runtime so currentColor tinting works.
 * Keys without a cloudinaryId fall back to the emoji placeholder.
 *
 * CATEGORY LANES (founder-resolved 2026-06-01): the canonical lanes are
 * farm/maritime/remote/seasonal/mix, matching the LOCKED icon taxonomy and the
 * packages/contracts enums (MARKETPLACE_CATEGORIES). "Lodge" is NOT a category --
 * it is a setting under the seasonal lane -- so no `category.lodge` key exists.
 * See docs/architecture-mirror/icon-registry.md.
 */

/** Canonical icon keys -- the founder-locked taxonomy (docs/design/icon-system.md). */
export type CanonicalIconKey =
	// category -- visual lanes for opportunity type
	| "category.farm"
	| "category.maritime"
	| "category.remote"
	| "category.seasonal"
	| "category.mix"
	// benefit -- the HOUSING/MEALS/PAY triad (+ supporting benefits)
	| "benefit.housing"
	| "benefit.meals"
	| "benefit.pay"
	| "benefit.transport"
	| "benefit.wifi"
	// mappin -- map markers, tinted per category, plus a cluster marker
	| "mappin.farm"
	| "mappin.maritime"
	| "mappin.remote"
	| "mappin.seasonal"
	| "mappin.mix"
	| "mappin.cluster"
	// trust -- host / employer credibility badges
	| "trust.verified_host"
	| "trust.founding_host"
	| "trust.featured_employer"
	// status -- listing fill / boost / match state
	| "status.open"
	| "status.partially_filled"
	| "status.filled"
	| "status.boosted"
	| "status.match"
	// action -- interactive affordances
	| "action.apply"
	| "action.save"
	| "action.share"
	| "action.report"
	| "action.message"
	| "action.filter"
	| "action.sort"
	| "action.back"
	| "action.forward"
	| "action.close"
	| "action.more"
	// nav -- primary navigation surfaces
	| "nav.seek"
	| "nav.swipe"
	| "nav.map"
	| "nav.saved"
	| "nav.messages"
	| "nav.dashboard"
	| "nav.profile"
	| "nav.admin"
	// analytics -- dashboard chart glyphs
	| "analytics.meter"
	| "analytics.funnel"
	| "analytics.trend"
	| "analytics.donut"
	| "analytics.source"
	// system -- inline feedback / state
	| "system.info"
	| "system.success"
	| "system.warning"
	| "system.error"
	| "system.lock"
	| "system.loading"

/**
 * Legacy keys from the first registry cut, retained as DEPRECATED aliases so
 * existing consumers keep compiling. Do NOT reference these in new code -- use
 * `aliasOf` (below) to find the canonical replacement. `aliasOf: null` means
 * there is no single canonical replacement (pick by context).
 */
export type DeprecatedIconKey =
	| "status.featured"
	| "status.seasonal"
	| "mappin.location"
	| "nav.host"

export type IconKey = CanonicalIconKey | DeprecatedIconKey

/** Cloudinary cloud name for this project's icon assets. */
export const CLOUDINARY_CLOUD = "dwiwyt9vi"

/**
 * Base URL for icon delivery. SVGs are stored as raw resources; no format
 * extension. Append `/{cloudinaryId}` to build the full delivery URL.
 */
export const CLOUDINARY_ICON_BASE = `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/raw/upload`

export interface IconEntry {
	/** The registry key. Stable identity -- never rename a shipped key. */
	key: IconKey
	/** Streamline Freehand concept hint(s) used to source the real asset. */
	streamline: string
	/** Emoji placeholder rendered when no Cloudinary asset is available. */
	placeholder: string
	/** Human-readable label / intent (also useful for aria-label fallbacks). */
	label: string
	/**
	 * Cloudinary public ID for the processed SVG asset.
	 * Pattern: explore-and-earn/icons/{domain}/{name}
	 * undefined = asset not yet uploaded; Icon falls back to emoji placeholder.
	 */
	cloudinaryId?: string
	/** True for legacy keys retained only for back-compat. */
	deprecated?: boolean
	/** Canonical key this alias should migrate to (null = no single canonical replacement). */
	aliasOf?: CanonicalIconKey | null
}

export const ICON_REGISTRY: Record<IconKey, IconEntry> = {
	// ---- category ----
	"category.farm": {
		key: "category.farm",
		streamline: "barn / wheat / basket / greenhouse",
		placeholder: "\u{1F33E}",
		label: "Farm / Orchard / Greenhouse",
		cloudinaryId: "explore-and-earn/icons/category/farm",
	},
	"category.maritime": {
		key: "category.maritime",
		streamline: "anchor / boat / rope",
		placeholder: "\u{2693}",
		label: "Maritime / Fishery",
		cloudinaryId: "explore-and-earn/icons/category/maritime",
	},
	"category.remote": {
		key: "category.remote",
		streamline: "laptop / desk / cabin",
		placeholder: "\u{1F4BB}",
		label: "Remote",
		cloudinaryId: "explore-and-earn/icons/category/remote",
	},
	"category.seasonal": {
		key: "category.seasonal",
		streamline: "leaf / sun / mountain",
		placeholder: "\u{1F343}",
		label: "Seasonal",
		cloudinaryId: "explore-and-earn/icons/category/seasonal",
	},
	"category.mix": {
		key: "category.mix",
		streamline: "compass / map",
		placeholder: "\u{1F9ED}",
		label: "Mix / Multi-category",
		cloudinaryId: "explore-and-earn/icons/category/mix",
	},
	// ---- benefit (HOUSING / MEALS / PAY triad) ----
	"benefit.housing": {
		key: "benefit.housing",
		streamline: "home / cabin / house",
		placeholder: "\u{1F3E0}",
		label: "Housing -- where will I sleep?",
		cloudinaryId: "explore-and-earn/icons/benefit/housing",
	},
	"benefit.meals": {
		key: "benefit.meals",
		streamline: "fork-knife / food / meal",
		placeholder: "\u{1F374}",
		label: "Meals -- what will I eat?",
		cloudinaryId: "explore-and-earn/icons/benefit/meals",
	},
	"benefit.pay": {
		key: "benefit.pay",
		streamline: "dollar / money / compensation",
		placeholder: "\u{1F4B5}",
		label: "Pay -- what will I earn?",
		cloudinaryId: "explore-and-earn/icons/benefit/pay",
	},
	"benefit.transport": {
		key: "benefit.transport",
		streamline: "bus / car / road",
		placeholder: "\u{1F690}",
		label: "Transport provided",
		cloudinaryId: "explore-and-earn/icons/benefit/transport",
	},
	"benefit.wifi": {
		key: "benefit.wifi",
		streamline: "wifi / signal",
		placeholder: "\u{1F4F6}",
		label: "Connectivity / Wi-Fi",
		cloudinaryId: "explore-and-earn/icons/benefit/wifi",
	},
	// ---- mappin (tinted per category via CSS currentColor) ----
	// All five category pins share one base SVG stored as separate Cloudinary
	// assets. Set `color` on the wrapping element to tint each pin.
	"mappin.farm": {
		key: "mappin.farm",
		streamline: "map-pin (farm tint)",
		placeholder: "\u{1F4CD}",
		label: "Farm pin",
		cloudinaryId: "explore-and-earn/icons/mappin/farm",
	},
	"mappin.maritime": {
		key: "mappin.maritime",
		streamline: "map-pin (maritime tint)",
		placeholder: "\u{1F4CD}",
		label: "Maritime pin",
		cloudinaryId: "explore-and-earn/icons/mappin/maritime",
	},
	"mappin.remote": {
		key: "mappin.remote",
		streamline: "map-pin (remote tint)",
		placeholder: "\u{1F4CD}",
		label: "Remote pin",
		cloudinaryId: "explore-and-earn/icons/mappin/remote",
	},
	"mappin.seasonal": {
		key: "mappin.seasonal",
		streamline: "map-pin (seasonal tint)",
		placeholder: "\u{1F4CD}",
		label: "Seasonal pin",
		cloudinaryId: "explore-and-earn/icons/mappin/seasonal",
	},
	"mappin.mix": {
		key: "mappin.mix",
		streamline: "map-pin (mix tint)",
		placeholder: "\u{1F4CD}",
		label: "Mix pin",
		cloudinaryId: "explore-and-earn/icons/mappin/mix",
	},
	"mappin.cluster": {
		key: "mappin.cluster",
		streamline: "stacked pins / number badge",
		placeholder: "\u{1F522}",
		label: "Clustered pins",
		// TODO: source Streamline Freehand cluster-badge icon
	},
	// ---- trust ----
	"trust.verified_host": {
		key: "trust.verified_host",
		streamline: "check-badge / verification",
		placeholder: "\u{2705}",
		label: "Verified Host (Self-Declared by Host)",
		cloudinaryId: "explore-and-earn/icons/trust/verified_host",
	},
	"trust.founding_host": {
		key: "trust.founding_host",
		streamline: "ribbon / seal",
		placeholder: "\u{1F397}",
		label: "Founding Host",
		cloudinaryId: "explore-and-earn/icons/trust/founding_host",
	},
	"trust.featured_employer": {
		key: "trust.featured_employer",
		streamline: "star",
		placeholder: "\u{2B50}",
		label: "Featured Employer",
		cloudinaryId: "explore-and-earn/icons/trust/featured_employer",
	},
	// ---- status ----
	"status.open": {
		key: "status.open",
		streamline: "open circle",
		placeholder: "\u{26AA}",
		label: "Open",
		cloudinaryId: "explore-and-earn/icons/status/open",
	},
	"status.partially_filled": {
		key: "status.partially_filled",
		streamline: "half-filled circle",
		placeholder: "\u{1F317}",
		label: "Partially filled",
		cloudinaryId: "explore-and-earn/icons/status/partially_filled",
	},
	"status.filled": {
		key: "status.filled",
		streamline: "filled circle",
		placeholder: "\u{26AB}",
		label: "Filled",
		cloudinaryId: "explore-and-earn/icons/status/filled",
	},
	"status.boosted": {
		key: "status.boosted",
		streamline: "glow / upward arrow",
		placeholder: "\u{1F680}",
		label: "Boosted",
		cloudinaryId: "explore-and-earn/icons/status/boosted",
	},
	"status.match": {
		key: "status.match",
		streamline: "target / spark",
		placeholder: "\u{1F3AF}",
		label: "Match",
		// TODO: source Streamline Freehand target/spark icon
	},
	// ---- action ----
	"action.apply": {
		key: "action.apply",
		streamline: "paper-plane / send",
		placeholder: "\u{27A4}",
		label: "Quick Apply",
		cloudinaryId: "explore-and-earn/icons/action/apply",
	},
	"action.save": {
		key: "action.save",
		streamline: "heart",
		placeholder: "\u{2764}",
		label: "Save",
		cloudinaryId: "explore-and-earn/icons/action/save",
	},
	"action.share": {
		key: "action.share",
		streamline: "share / export",
		placeholder: "\u{1F517}",
		label: "Share",
		cloudinaryId: "explore-and-earn/icons/action/share",
	},
	"action.report": {
		key: "action.report",
		streamline: "flag",
		placeholder: "\u{1F6A9}",
		label: "Report",
		cloudinaryId: "explore-and-earn/icons/action/report",
	},
	"action.message": {
		key: "action.message",
		streamline: "chat / speech-bubble",
		placeholder: "\u{1F4AC}",
		label: "Message",
		cloudinaryId: "explore-and-earn/icons/action/message",
	},
	"action.filter": {
		key: "action.filter",
		streamline: "sliders",
		placeholder: "\u{1F39B}",
		label: "Filter",
		cloudinaryId: "explore-and-earn/icons/action/filter",
	},
	"action.sort": {
		key: "action.sort",
		streamline: "up-down arrows",
		placeholder: "\u{2195}",
		label: "Sort",
		cloudinaryId: "explore-and-earn/icons/action/sort",
	},
	"action.back": {
		key: "action.back",
		streamline: "chevron-left",
		placeholder: "\u{25C0}",
		label: "Back",
		cloudinaryId: "explore-and-earn/icons/action/back",
	},
	"action.forward": {
		key: "action.forward",
		streamline: "chevron-right",
		placeholder: "\u{25B6}",
		label: "Forward",
		cloudinaryId: "explore-and-earn/icons/action/forward",
	},
	"action.close": {
		key: "action.close",
		streamline: "x / cross",
		placeholder: "\u{2716}",
		label: "Close",
		cloudinaryId: "explore-and-earn/icons/action/close",
	},
	"action.more": {
		key: "action.more",
		streamline: "ellipsis / kebab",
		placeholder: "\u{2026}",
		label: "More",
		cloudinaryId: "explore-and-earn/icons/action/more",
	},
	// ---- nav ----
	"nav.seek": {
		key: "nav.seek",
		streamline: "magnifier / compass",
		placeholder: "\u{1F50D}",
		label: "Seek / Discover",
		cloudinaryId: "explore-and-earn/icons/nav/seek",
	},
	"nav.swipe": {
		key: "nav.swipe",
		streamline: "swipe / shuffle cards",
		placeholder: "\u{1F500}",
		label: "Swipe",
		// TODO: source Streamline Freehand swipe/shuffle-cards icon
	},
	"nav.map": {
		key: "nav.map",
		streamline: "folded map",
		placeholder: "\u{1F5FA}",
		label: "Map",
		// TODO: source Streamline Freehand folded-map icon (GPS-Location-Rectangle candidate was low-confidence)
	},
	"nav.saved": {
		key: "nav.saved",
		streamline: "bookmark / heart",
		placeholder: "\u{1F516}",
		label: "Saved",
		cloudinaryId: "explore-and-earn/icons/nav/saved",
	},
	"nav.messages": {
		key: "nav.messages",
		streamline: "chat bubbles",
		placeholder: "\u{1F4AC}",
		label: "Messages",
		cloudinaryId: "explore-and-earn/icons/nav/messages",
	},
	"nav.dashboard": {
		key: "nav.dashboard",
		streamline: "grid / gauge",
		placeholder: "\u{1F4CA}",
		label: "Dashboard",
		cloudinaryId: "explore-and-earn/icons/nav/dashboard",
	},
	"nav.profile": {
		key: "nav.profile",
		streamline: "user / avatar",
		placeholder: "\u{1F464}",
		label: "Profile",
		cloudinaryId: "explore-and-earn/icons/nav/profile",
	},
	"nav.admin": {
		key: "nav.admin",
		streamline: "shield / control",
		placeholder: "\u{1F6E1}",
		label: "Admin",
		cloudinaryId: "explore-and-earn/icons/nav/admin",
	},
	// ---- analytics ----
	"analytics.meter": {
		key: "analytics.meter",
		streamline: "gauge / meter",
		placeholder: "\u{1F321}",
		label: "Meter",
		cloudinaryId: "explore-and-earn/icons/analytics/meter",
	},
	"analytics.funnel": {
		key: "analytics.funnel",
		streamline: "funnel",
		placeholder: "\u{1F53B}",
		label: "Funnel",
		// TODO: source Streamline Freehand funnel-chart icon
	},
	"analytics.trend": {
		key: "analytics.trend",
		streamline: "line / trend",
		placeholder: "\u{1F4C8}",
		label: "Trend",
		cloudinaryId: "explore-and-earn/icons/analytics/trend",
	},
	"analytics.donut": {
		key: "analytics.donut",
		streamline: "donut chart",
		placeholder: "\u{1F369}",
		label: "Donut chart",
		// TODO: source Streamline Freehand donut/ring-chart icon
	},
	"analytics.source": {
		key: "analytics.source",
		streamline: "bars / source",
		placeholder: "\u{1F4CA}",
		label: "Source breakdown",
		cloudinaryId: "explore-and-earn/icons/analytics/source",
	},
	// ---- system ----
	"system.info": {
		key: "system.info",
		streamline: "info circle",
		placeholder: "\u{2139}",
		label: "Info",
		cloudinaryId: "explore-and-earn/icons/system/info",
	},
	"system.success": {
		key: "system.success",
		streamline: "check",
		placeholder: "\u{2714}",
		label: "Success",
		cloudinaryId: "explore-and-earn/icons/system/success",
	},
	"system.warning": {
		key: "system.warning",
		streamline: "warning triangle",
		placeholder: "\u{26A0}",
		label: "Warning",
		cloudinaryId: "explore-and-earn/icons/system/warning",
	},
	"system.error": {
		key: "system.error",
		streamline: "no-entry / x-octagon",
		placeholder: "\u{26D4}",
		label: "Error",
		// TODO: source Streamline Freehand x-circle/error-octagon icon
	},
	"system.lock": {
		key: "system.lock",
		streamline: "padlock",
		placeholder: "\u{1F512}",
		label: "Lock",
		cloudinaryId: "explore-and-earn/icons/system/lock",
	},
	"system.loading": {
		key: "system.loading",
		streamline: "spinner / hourglass",
		placeholder: "\u{23F3}",
		label: "Loading",
		cloudinaryId: "explore-and-earn/icons/system/loading",
	},
	// ---- DEPRECATED ALIASES (retained for back-compat; do not use in new code) ----
	"status.featured": {
		key: "status.featured",
		streamline: "star",
		placeholder: "\u{2B50}",
		label: "Featured (deprecated)",
		deprecated: true,
		aliasOf: "trust.featured_employer",
	},
	"status.seasonal": {
		key: "status.seasonal",
		streamline: "leaf",
		placeholder: "\u{1F343}",
		label: "Seasonal status (deprecated -- seasonal is a category)",
		deprecated: true,
		aliasOf: "category.seasonal",
	},
	"mappin.location": {
		key: "mappin.location",
		streamline: "generic map-pin",
		placeholder: "\u{1F4CD}",
		label: "Generic pin (deprecated -- use mappin.<category> or nav.map)",
		deprecated: true,
		aliasOf: null,
	},
	"nav.host": {
		key: "nav.host",
		streamline: "user / avatar",
		placeholder: "\u{1F464}",
		label: "Host nav (deprecated)",
		deprecated: true,
		aliasOf: "nav.profile",
	},
}

/**
 * Ordered list of every canonical key. Kept in sync with CanonicalIconKey via the
 * compile-time tests in ./__type-tests__/registry.type-test.ts -- adding a key to
 * the union without adding it here (or vice-versa) is a type error.
 */
export const CANONICAL_ICON_KEYS = [
	"category.farm",
	"category.maritime",
	"category.remote",
	"category.seasonal",
	"category.mix",
	"benefit.housing",
	"benefit.meals",
	"benefit.pay",
	"benefit.transport",
	"benefit.wifi",
	"mappin.farm",
	"mappin.maritime",
	"mappin.remote",
	"mappin.seasonal",
	"mappin.mix",
	"mappin.cluster",
	"trust.verified_host",
	"trust.founding_host",
	"trust.featured_employer",
	"status.open",
	"status.partially_filled",
	"status.filled",
	"status.boosted",
	"status.match",
	"action.apply",
	"action.save",
	"action.share",
	"action.report",
	"action.message",
	"action.filter",
	"action.sort",
	"action.back",
	"action.forward",
	"action.close",
	"action.more",
	"nav.seek",
	"nav.swipe",
	"nav.map",
	"nav.saved",
	"nav.messages",
	"nav.dashboard",
	"nav.profile",
	"nav.admin",
	"analytics.meter",
	"analytics.funnel",
	"analytics.trend",
	"analytics.donut",
	"analytics.source",
	"system.info",
	"system.success",
	"system.warning",
	"system.error",
	"system.lock",
	"system.loading",
] as const satisfies readonly CanonicalIconKey[]

/** Resolve a registry entry for any key (canonical or deprecated). */
export function getIcon(key: IconKey): IconEntry {
	return ICON_REGISTRY[key]
}

/** Type guard: true when `key` is a canonical (non-deprecated) icon key. */
export function isCanonicalIconKey(key: IconKey): key is CanonicalIconKey {
	return ICON_REGISTRY[key].deprecated !== true
}

/** Build the full Cloudinary delivery URL for an icon entry. Returns null when no asset is uploaded yet. */
export function getIconUrl(entry: IconEntry): string | null {
	if (!entry.cloudinaryId) return null
	return `${CLOUDINARY_ICON_BASE}/${entry.cloudinaryId}`
}
