"use client"

/**
 * Icon registry — the single source of truth AND the single swap-point.
 *
 * Every icon in the product renders through <Icon name="domain.name"/>, which
 * looks the name up here. Provider: **Phosphor Icons** (@phosphor-icons/react,
 * MIT) — free, self-contained in node_modules, no runtime fetch, no committed
 * assets. This replaced the paid Streamline Freehand set + its Cloudinary
 * runtime-fetch delivery (founder-relaxed 2026-07-02; see
 * docs/superpowers/specs/2026-07-02-phosphor-icon-swap-design.md).
 *
 * INTERCHANGEABLE BY DESIGN:
 *   - Re-map ONE icon → change that entry's `icon` (and optionally `weight`).
 *   - Swap the ENTIRE provider → this file is the only place that imports the
 *     icon library. Icon.tsx is provider-agnostic (it renders `entry.icon` with
 *     size/weight/color). Point the entries at a different set and you're done.
 *   - Change the global default weight → Icon.tsx `DEFAULT_ICON_WEIGHT`.
 *   - Per-key default weight (e.g. map pins) → the entry's `weight`.
 *   - Per-call override → pass `weight`/`size`/`color` to <Icon>.
 *
 * Guardrail G30 still forbids Lucide/Heroicons/Font-Awesome/Material/react-icons
 * and ad-hoc inline <svg> in feature code: icons go through <Icon> only.
 *
 * The `IconKey` taxonomy is stable product API — never rename a shipped key.
 */

import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import {
	Anchor,
	Archive,
	ArrowLeft,
	ArrowRight,
	ArrowsDownUp,
	ArrowUUpLeft,
	Basket,
	Bell,
	BookmarkSimple,
	Briefcase,
	CalendarBlank,
	CalendarX,
	Cards,
	ChartDonut,
	ChatCircle,
	CheckCircle,
	CircleDashed,
	CircleHalf,
	CircleNotch,
	CirclesThree,
	Coffee,
	Compass,
	CookingPot,
	Crown,
	CurrencyDollar,
	DotsThree,
	DownloadSimple,
	Eye,
	Flag,
	ForkKnife,
	Funnel,
	FunnelSimple,
	Gauge,
	GearSix,
	Handshake,
	Horse,
	House,
	Image,
	Info,
	Laptop,
	LinkSimple,
	Lock,
	MagnifyingGlass,
	MapPin,
	MapTrifold,
	Medal,
	Megaphone,
	Newspaper,
	NotePencil,
	PaperPlaneTilt,
	PauseCircle,
	PencilSimple,
	Plant,
	Question,
	ReadCvLogo,
	Rocket,
	SealCheck,
	ShareNetwork,
	ShieldStar,
	Shuffle,
	SignOut,
	Sparkle,
	SquaresFour,
	Star,
	Storefront,
	Sun,
	Trash,
	TreeStructure,
	TrendUp,
	UploadSimple,
	UserCircle,
	UsersThree,
	Van,
	Warning,
	WifiHigh,
	Wrench,
	X,
	XCircle,
} from "@phosphor-icons/react";

/** Icon stroke weight — provider-agnostic alias (matches Phosphor's weights). */
export type IconWeight =
	| "thin"
	| "light"
	| "regular"
	| "bold"
	| "fill"
	| "duotone";

/** Canonical icon keys — the founder-locked taxonomy (docs/design/icon-system.md). */
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
	// status -- listing fill / boost / match state + date range
	| "status.open"
	| "status.partially_filled"
	| "status.filled"
	| "status.boosted"
	| "status.match"
	| "status.begins"
	| "status.ends"
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
	| "action.edit"
	| "action.delete"
	| "action.search"
	| "action.settings"
	| "action.upload"
	| "action.download"
	| "action.view"
	| "action.link"
	// nav -- primary navigation surfaces + community dashboard tabs + admin tabs
	| "nav.seek"
	| "nav.swipe"
	| "nav.map"
	| "nav.saved"
	| "nav.messages"
	| "nav.dashboard"
	| "nav.profile"
	| "nav.admin"
	| "nav.feed"
	| "nav.photos"
	| "nav.announcements"
	| "nav.seekers"
	| "nav.hosts"
	| "nav.reports"
	| "nav.notifications"
	| "nav.settings"
	| "nav.logout"
	| "nav.help"
	// status -- application / listing lifecycle states
	| "status.applied"
	| "status.offered"
	| "status.accepted"
	| "status.declined"
	| "status.withdrawn"
	| "status.draft"
	| "status.paused"
	| "status.archived"
	// profile / resume -- seeker identity surfaces
	| "profile.resume"
	| "profile.skills"
	| "profile.experience"
	| "profile.verification"
	// work -- finer work-type glyphs within the category lanes
	| "work.harvest"
	| "work.hospitality"
	| "work.kitchen"
	| "work.deckhand"
	| "work.ranch"
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
	| "system.loading";

/**
 * Legacy keys from the first registry cut, retained as DEPRECATED aliases so
 * existing consumers keep compiling. Do NOT reference these in new code -- use
 * `aliasOf` to find the canonical replacement. `aliasOf: null` means there is
 * no single canonical replacement (pick by context).
 */
export type DeprecatedIconKey =
	| "status.featured"
	| "status.seasonal"
	| "mappin.location"
	| "nav.host";

export type IconKey = CanonicalIconKey | DeprecatedIconKey;

export interface IconEntry {
	/** The registry key. Stable identity -- never rename a shipped key. */
	key: IconKey;
	/** Phosphor component this key renders. Change this to re-map one icon. */
	icon: PhosphorIcon;
	/** Human-readable label / intent (also the aria-label fallback). */
	label: string;
	/** Per-key default weight override (e.g. map pins render duotone). */
	weight?: IconWeight;
	/** True for legacy keys retained only for back-compat. */
	deprecated?: boolean;
	/** Canonical key this alias should migrate to (null = no single replacement). */
	aliasOf?: CanonicalIconKey | null;
}

export const ICON_REGISTRY: Record<IconKey, IconEntry> = {
	// ---- category ----
	"category.farm": { key: "category.farm", icon: Plant, label: "Farm / Orchard / Greenhouse" },
	"category.maritime": { key: "category.maritime", icon: Anchor, label: "Maritime / Boats / Harbor" },
	"category.remote": { key: "category.remote", icon: Laptop, label: "Remote / Online work" },
	"category.seasonal": { key: "category.seasonal", icon: Sun, label: "Seasonal / Resort / Lodge" },
	"category.mix": { key: "category.mix", icon: Shuffle, label: "Mixed / Multi-category" },

	// ---- benefit (Housing / Meals / Pay triad) ----
	"benefit.housing": { key: "benefit.housing", icon: House, label: "Housing included" },
	"benefit.meals": { key: "benefit.meals", icon: ForkKnife, label: "Meals included" },
	"benefit.pay": { key: "benefit.pay", icon: CurrencyDollar, label: "Pay" },
	"benefit.transport": { key: "benefit.transport", icon: Van, label: "Transport / Travel support" },
	"benefit.wifi": { key: "benefit.wifi", icon: WifiHigh, label: "Wi-Fi / Connectivity" },

	// ---- mappin (category-tinted markers; render duotone) ----
	"mappin.farm": { key: "mappin.farm", icon: MapPin, label: "Farm location", weight: "duotone" },
	"mappin.maritime": { key: "mappin.maritime", icon: MapPin, label: "Maritime location", weight: "duotone" },
	"mappin.remote": { key: "mappin.remote", icon: MapPin, label: "Remote location", weight: "duotone" },
	"mappin.seasonal": { key: "mappin.seasonal", icon: MapPin, label: "Seasonal location", weight: "duotone" },
	"mappin.mix": { key: "mappin.mix", icon: MapPin, label: "Mixed location", weight: "duotone" },
	"mappin.cluster": { key: "mappin.cluster", icon: CirclesThree, label: "Clustered locations", weight: "duotone" },

	// ---- trust ----
	"trust.verified_host": { key: "trust.verified_host", icon: SealCheck, label: "Verified host" },
	"trust.founding_host": { key: "trust.founding_host", icon: Medal, label: "Founding host" },
	"trust.featured_employer": { key: "trust.featured_employer", icon: Crown, label: "Featured employer" },

	// ---- status: listing fill / boost / match + date range ----
	"status.open": { key: "status.open", icon: CircleDashed, label: "Open spots" },
	"status.partially_filled": { key: "status.partially_filled", icon: CircleHalf, label: "Partially filled" },
	"status.filled": { key: "status.filled", icon: UsersThree, label: "Filled" },
	"status.boosted": { key: "status.boosted", icon: Rocket, label: "Boosted" },
	"status.match": { key: "status.match", icon: Sparkle, label: "Match" },
	"status.begins": { key: "status.begins", icon: CalendarBlank, label: "Begins" },
	"status.ends": { key: "status.ends", icon: CalendarX, label: "Ends" },

	// ---- action ----
	"action.apply": { key: "action.apply", icon: PaperPlaneTilt, label: "Apply" },
	"action.save": { key: "action.save", icon: BookmarkSimple, label: "Save" },
	"action.share": { key: "action.share", icon: ShareNetwork, label: "Share" },
	"action.report": { key: "action.report", icon: Flag, label: "Report" },
	"action.message": { key: "action.message", icon: ChatCircle, label: "Message" },
	"action.filter": { key: "action.filter", icon: FunnelSimple, label: "Filter" },
	"action.sort": { key: "action.sort", icon: ArrowsDownUp, label: "Sort" },
	"action.back": { key: "action.back", icon: ArrowLeft, label: "Back" },
	"action.forward": { key: "action.forward", icon: ArrowRight, label: "Forward" },
	"action.close": { key: "action.close", icon: X, label: "Close" },
	"action.more": { key: "action.more", icon: DotsThree, label: "More" },
	"action.edit": { key: "action.edit", icon: PencilSimple, label: "Edit" },
	"action.delete": { key: "action.delete", icon: Trash, label: "Delete" },
	"action.search": { key: "action.search", icon: MagnifyingGlass, label: "Search" },
	"action.settings": { key: "action.settings", icon: GearSix, label: "Settings" },
	"action.upload": { key: "action.upload", icon: UploadSimple, label: "Upload" },
	"action.download": { key: "action.download", icon: DownloadSimple, label: "Download" },
	"action.view": { key: "action.view", icon: Eye, label: "View" },
	"action.link": { key: "action.link", icon: LinkSimple, label: "Link" },

	// ---- nav ----
	"nav.seek": { key: "nav.seek", icon: Compass, label: "Seek / Discover" },
	"nav.swipe": { key: "nav.swipe", icon: Cards, label: "Swipe" },
	"nav.map": { key: "nav.map", icon: MapTrifold, label: "Map" },
	"nav.saved": { key: "nav.saved", icon: BookmarkSimple, label: "Saved" },
	"nav.messages": { key: "nav.messages", icon: ChatCircle, label: "Messages" },
	"nav.dashboard": { key: "nav.dashboard", icon: SquaresFour, label: "Dashboard" },
	"nav.profile": { key: "nav.profile", icon: UserCircle, label: "Profile" },
	"nav.admin": { key: "nav.admin", icon: ShieldStar, label: "Admin" },
	"nav.feed": { key: "nav.feed", icon: Newspaper, label: "Community feed" },
	"nav.photos": { key: "nav.photos", icon: Image, label: "Photos" },
	"nav.announcements": { key: "nav.announcements", icon: Megaphone, label: "Announcements" },
	"nav.seekers": { key: "nav.seekers", icon: UsersThree, label: "Seekers" },
	"nav.hosts": { key: "nav.hosts", icon: Storefront, label: "Hosts" },
	"nav.reports": { key: "nav.reports", icon: Flag, label: "Reports" },
	"nav.notifications": { key: "nav.notifications", icon: Bell, label: "Notifications" },
	"nav.settings": { key: "nav.settings", icon: GearSix, label: "Settings" },
	"nav.logout": { key: "nav.logout", icon: SignOut, label: "Log out" },
	"nav.help": { key: "nav.help", icon: Question, label: "Help" },

	// ---- status: application / listing lifecycle ----
	"status.applied": { key: "status.applied", icon: PaperPlaneTilt, label: "Applied" },
	"status.offered": { key: "status.offered", icon: Handshake, label: "Offered" },
	"status.accepted": { key: "status.accepted", icon: CheckCircle, label: "Accepted" },
	"status.declined": { key: "status.declined", icon: XCircle, label: "Declined" },
	"status.withdrawn": { key: "status.withdrawn", icon: ArrowUUpLeft, label: "Withdrawn" },
	"status.draft": { key: "status.draft", icon: NotePencil, label: "Draft" },
	"status.paused": { key: "status.paused", icon: PauseCircle, label: "Paused" },
	"status.archived": { key: "status.archived", icon: Archive, label: "Archived" },

	// ---- profile / resume ----
	"profile.resume": { key: "profile.resume", icon: ReadCvLogo, label: "Resume" },
	"profile.skills": { key: "profile.skills", icon: Wrench, label: "Skills" },
	"profile.experience": { key: "profile.experience", icon: Briefcase, label: "Experience" },
	"profile.verification": { key: "profile.verification", icon: SealCheck, label: "Verification" },

	// ---- work ----
	"work.harvest": { key: "work.harvest", icon: Basket, label: "Harvest" },
	"work.hospitality": { key: "work.hospitality", icon: Coffee, label: "Hospitality" },
	"work.kitchen": { key: "work.kitchen", icon: CookingPot, label: "Kitchen" },
	"work.deckhand": { key: "work.deckhand", icon: Anchor, label: "Deckhand" },
	"work.ranch": { key: "work.ranch", icon: Horse, label: "Ranch" },

	// ---- analytics ----
	"analytics.meter": { key: "analytics.meter", icon: Gauge, label: "Meter" },
	"analytics.funnel": { key: "analytics.funnel", icon: Funnel, label: "Funnel" },
	"analytics.trend": { key: "analytics.trend", icon: TrendUp, label: "Trend" },
	"analytics.donut": { key: "analytics.donut", icon: ChartDonut, label: "Donut chart" },
	"analytics.source": { key: "analytics.source", icon: TreeStructure, label: "Source" },

	// ---- system ----
	"system.info": { key: "system.info", icon: Info, label: "Info" },
	"system.success": { key: "system.success", icon: CheckCircle, label: "Success" },
	"system.warning": { key: "system.warning", icon: Warning, label: "Warning" },
	"system.error": { key: "system.error", icon: XCircle, label: "Error" },
	"system.lock": { key: "system.lock", icon: Lock, label: "Locked" },
	"system.loading": { key: "system.loading", icon: CircleNotch, label: "Loading" },

	// ---- deprecated aliases (retained for back-compat; prefer the canonical key) ----
	"status.featured": { key: "status.featured", icon: Star, label: "Featured", deprecated: true, aliasOf: "trust.featured_employer" },
	"status.seasonal": { key: "status.seasonal", icon: Sun, label: "Seasonal", deprecated: true, aliasOf: "category.seasonal" },
	"mappin.location": { key: "mappin.location", icon: MapPin, label: "Location", deprecated: true, aliasOf: null },
	"nav.host": { key: "nav.host", icon: Storefront, label: "Host", deprecated: true, aliasOf: "nav.hosts" },
};

/** All canonical (non-deprecated) keys, for iteration (e.g. an icon gallery). */
export const CANONICAL_ICON_KEYS = (
	Object.values(ICON_REGISTRY) as IconEntry[]
)
	.filter((entry) => entry.deprecated !== true)
	.map((entry) => entry.key) as readonly CanonicalIconKey[];

/** Resolve a registry entry for any key (canonical or deprecated). */
export function getIcon(key: IconKey): IconEntry {
	return ICON_REGISTRY[key];
}

/** Type guard: true when `key` is a canonical (non-deprecated) icon key. */
export function isCanonicalIconKey(key: IconKey): key is CanonicalIconKey {
	return ICON_REGISTRY[key].deprecated !== true;
}
