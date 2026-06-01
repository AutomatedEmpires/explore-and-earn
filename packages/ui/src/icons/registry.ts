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
 * OPEN QUESTION (canon drift -- do not resolve unilaterally): the Discovery Card
 * spec (docs/design/discovery-card-v1.md) describes category lanes as
 * farm/lodge/maritime/remote, while the LOCKED icon taxonomy and the
 * packages/contracts enums (MARKETPLACE_CATEGORIES) use
 * farm/maritime/remote/seasonal/mix. This registry follows the LOCKED icon
 * taxonomy and keeps `category.lodge` as a deprecated alias pending founder
 * reconciliation. See docs/architecture-mirror/icon-registry.md.
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
 * `aliasOf` (below) to find the canonical replacement. `aliasOf: null` means the
 * mapping is blocked on an open canon question (see file header).
 */
export type DeprecatedIconKey =
	| "category.lodge"
	| "status.featured"
	| "status.seasonal"
	| "mappin.location"
	| "nav.host"

export type IconKey = CanonicalIconKey | DeprecatedIconKey

export interface IconEntry {
	/** The registry key. Stable identity -- never rename a shipped key. */
	key: IconKey
	/** Streamline Freehand concept hint(s) used to source the real asset later. */
	streamline: string
	/** Emoji placeholder rendered until the licensed asset is wired in. */
	placeholder: string
	/** Human-readable label / intent (also useful for aria-label fallbacks). */
	label: string
	/** True for legacy keys retained only for back-compat. */
	deprecated?: boolean
	/** Canonical key this alias should migrate to (null = blocked on open canon question). */
	aliasOf?: CanonicalIconKey | null
}

export const ICON_REGISTRY: Record<IconKey, IconEntry> = {
	// ---- category ----
	"category.farm": { key: "category.farm", streamline: "barn / wheat / basket / greenhouse", placeholder: "\u{1F33E}", label: "Farm / Orchard / Greenhouse" },
	"category.maritime": { key: "category.maritime", streamline: "anchor / boat / rope", placeholder: "\u{2693}", label: "Maritime / Fishery" },
	"category.remote": { key: "category.remote", streamline: "laptop / desk / cabin", placeholder: "\u{1F4BB}", label: "Remote" },
	"category.seasonal": { key: "category.seasonal", streamline: "leaf / sun / mountain", placeholder: "\u{1F343}", label: "Seasonal" },
	"category.mix": { key: "category.mix", streamline: "compass / overlapping shapes", placeholder: "\u{1F9ED}", label: "Mixed / Other" },
	// ---- benefit (HOUSING / MEALS / PAY triad) ----
	"benefit.housing": { key: "benefit.housing", streamline: "house / cabin / bed", placeholder: "\u{1F3E0}", label: "Housing -- where will I sleep?" },
	"benefit.meals": { key: "benefit.meals", streamline: "fork-knife / plate", placeholder: "\u{1F374}", label: "Meals -- what will I eat?" },
	"benefit.pay": { key: "benefit.pay", streamline: "banknote / coins", placeholder: "\u{1F4B5}", label: "Pay -- what will I earn?" },
	"benefit.transport": { key: "benefit.transport", streamline: "shuttle / road", placeholder: "\u{1F690}", label: "Transport provided" },
	"benefit.wifi": { key: "benefit.wifi", streamline: "wifi / signal", placeholder: "\u{1F4F6}", label: "Connectivity / Wi-Fi" },
	// ---- mappin (tinted per category) ----
	"mappin.farm": { key: "mappin.farm", streamline: "map-pin (farm tint)", placeholder: "\u{1F4CD}", label: "Farm pin" },
	"mappin.maritime": { key: "mappin.maritime", streamline: "map-pin (maritime tint)", placeholder: "\u{1F4CD}", label: "Maritime pin" },
	"mappin.remote": { key: "mappin.remote", streamline: "map-pin (remote tint)", placeholder: "\u{1F4CD}", label: "Remote pin" },
	"mappin.seasonal": { key: "mappin.seasonal", streamline: "map-pin (seasonal tint)", placeholder: "\u{1F4CD}", label: "Seasonal pin" },
	"mappin.mix": { key: "mappin.mix", streamline: "map-pin (mixed tint)", placeholder: "\u{1F4CD}", label: "Mixed pin" },
	"mappin.cluster": { key: "mappin.cluster", streamline: "stacked pins / count badge", placeholder: "\u{1F522}", label: "Clustered pins" },
	// ---- trust ----
	"trust.verified_host": { key: "trust.verified_host", streamline: "check-badge / shield-check", placeholder: "\u{2705}", label: "Verified Host (Self-Declared by Host)" },
	"trust.founding_host": { key: "trust.founding_host", streamline: "ribbon / seal", placeholder: "\u{1F397}", label: "Founding Host" },
	"trust.featured_employer": { key: "trust.featured_employer", streamline: "star / spotlight", placeholder: "\u{2B50}", label: "Featured Employer" },
	// ---- status ----
	"status.open": { key: "status.open", streamline: "open circle", placeholder: "\u{26AA}", label: "Open" },
	"status.partially_filled": { key: "status.partially_filled", streamline: "half-filled circle", placeholder: "\u{1F317}", label: "Partially filled" },
	"status.filled": { key: "status.filled", streamline: "filled circle", placeholder: "\u{26AB}", label: "Filled" },
	"status.boosted": { key: "status.boosted", streamline: "glow / upward arrow", placeholder: "\u{1F680}", label: "Boosted" },
	"status.match": { key: "status.match", streamline: "target / spark", placeholder: "\u{1F3AF}", label: "Match" },
	// ---- action ----
	"action.apply": { key: "action.apply", streamline: "paper-plane / send", placeholder: "\u{27A4}", label: "Quick Apply" },
	"action.save": { key: "action.save", streamline: "heart", placeholder: "\u{2764}", label: "Save" },
	"action.share": { key: "action.share", streamline: "share / export", placeholder: "\u{1F517}", label: "Share" },
	"action.report": { key: "action.report", streamline: "flag", placeholder: "\u{1F6A9}", label: "Report" },
	"action.message": { key: "action.message", streamline: "speech-bubble", placeholder: "\u{1F4AC}", label: "Message" },
	"action.filter": { key: "action.filter", streamline: "sliders / funnel", placeholder: "\u{1F39B}", label: "Filter" },
	"action.sort": { key: "action.sort", streamline: "up-down arrows", placeholder: "\u{2195}", label: "Sort" },
	"action.back": { key: "action.back", streamline: "chevron-left", placeholder: "\u{25C0}", label: "Back" },
	"action.forward": { key: "action.forward", streamline: "chevron-right", placeholder: "\u{25B6}", label: "Forward" },
	"action.close": { key: "action.close", streamline: "x / cross", placeholder: "\u{2716}", label: "Close" },
	"action.more": { key: "action.more", streamline: "ellipsis / kebab", placeholder: "\u{2026}", label: "More" },
	// ---- nav ----
	"nav.seek": { key: "nav.seek", streamline: "magnifier / compass", placeholder: "\u{1F50D}", label: "Seek / Discover" },
	"nav.swipe": { key: "nav.swipe", streamline: "swipe / shuffle cards", placeholder: "\u{1F500}", label: "Swipe" },
	"nav.map": { key: "nav.map", streamline: "folded map", placeholder: "\u{1F5FA}", label: "Map" },
	"nav.saved": { key: "nav.saved", streamline: "bookmark / heart", placeholder: "\u{1F516}", label: "Saved" },
	"nav.messages": { key: "nav.messages", streamline: "chat bubbles", placeholder: "\u{1F4AC}", label: "Messages" },
	"nav.dashboard": { key: "nav.dashboard", streamline: "grid / gauge", placeholder: "\u{1F4CA}", label: "Dashboard" },
	"nav.profile": { key: "nav.profile", streamline: "user / avatar", placeholder: "\u{1F464}", label: "Profile" },
	"nav.admin": { key: "nav.admin", streamline: "shield / control", placeholder: "\u{1F6E1}", label: "Admin" },
	// ---- analytics ----
	"analytics.meter": { key: "analytics.meter", streamline: "gauge / meter", placeholder: "\u{1F321}", label: "Meter" },
	"analytics.funnel": { key: "analytics.funnel", streamline: "funnel", placeholder: "\u{1F53B}", label: "Funnel" },
	"analytics.trend": { key: "analytics.trend", streamline: "line / trend", placeholder: "\u{1F4C8}", label: "Trend" },
	"analytics.donut": { key: "analytics.donut", streamline: "donut chart", placeholder: "\u{1F369}", label: "Donut chart" },
	"analytics.source": { key: "analytics.source", streamline: "bar chart / source", placeholder: "\u{1F4CA}", label: "Source breakdown" },
	// ---- system ----
	"system.info": { key: "system.info", streamline: "info circle", placeholder: "\u{2139}", label: "Info" },
	"system.success": { key: "system.success", streamline: "check", placeholder: "\u{2714}", label: "Success" },
	"system.warning": { key: "system.warning", streamline: "warning triangle", placeholder: "\u{26A0}", label: "Warning" },
	"system.error": { key: "system.error", streamline: "no-entry / x-octagon", placeholder: "\u{26D4}", label: "Error" },
	"system.lock": { key: "system.lock", streamline: "padlock", placeholder: "\u{1F512}", label: "Lock" },
	"system.loading": { key: "system.loading", streamline: "spinner / hourglass", placeholder: "\u{23F3}", label: "Loading" },
	// ---- DEPRECATED ALIASES (retained for back-compat; do not use in new code) ----
	"category.lodge": { key: "category.lodge", streamline: "cabin / mountain lodge", placeholder: "\u{1F3D4}", label: "Lodge (deprecated -- category drift)", deprecated: true, aliasOf: null },
	"status.featured": { key: "status.featured", streamline: "star", placeholder: "\u{2B50}", label: "Featured (deprecated)", deprecated: true, aliasOf: "trust.featured_employer" },
	"status.seasonal": { key: "status.seasonal", streamline: "leaf", placeholder: "\u{1F343}", label: "Seasonal status (deprecated -- seasonal is a category)", deprecated: true, aliasOf: "category.seasonal" },
	"mappin.location": { key: "mappin.location", streamline: "generic map-pin", placeholder: "\u{1F4CD}", label: "Generic pin (deprecated -- use mappin.<category> or nav.map)", deprecated: true, aliasOf: null },
	"nav.host": { key: "nav.host", streamline: "user / avatar", placeholder: "\u{1F464}", label: "Host nav (deprecated)", deprecated: true, aliasOf: "nav.profile" },
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
