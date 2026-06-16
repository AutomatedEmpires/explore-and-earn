/**
 * Illustration registry — Streamline Freehand "spot" art for empty states, onboarding,
 * heroes, success moments, and error pages. Rendered large inside a framed paper plate
 * by <AppIllustration>.
 *
 * Delivery is identical to icons: the cloudinaryId points at a real SVG in the
 * explore-and-earn/icons Cloudinary folder (verified — see
 * docs/design/streamline-cloudinary-inventory.md). To swap art globally, change one
 * cloudinaryId here; no component edits. When the dedicated Streamline Illustration
 * families are later pulled into explore-and-earn/illustrations, only these IDs change.
 */

import type { VisualAssetEntry } from "./types"

export type IllustrationKey =
	// empty states (seeker)
	| "empty.savedListings"
	| "empty.applications"
	| "empty.offers"
	| "empty.accepted"
	| "empty.notSelected"
	| "empty.withdrawn"
	| "empty.invites"
	| "empty.messages"
	| "empty.notifications"
	| "empty.schedule"
	| "empty.community"
	| "empty.photos"
	| "empty.announcements"
	| "empty.searchNoResults"
	// empty states (host) + map
	| "empty.hostListings"
	| "empty.hostApplicants"
	| "empty.map"
	// onboarding
	| "onboarding.seeker"
	| "onboarding.host"
	// heroes / marketing accents
	| "hero.discover"
	| "hero.adventure"
	| "hero.maritime"
	| "hero.camp"
	// success moments
	| "success.applicationSubmitted"
	| "success.offerReceived"
	| "success.profileComplete"
	| "success.listingPublished"
	// errors
	| "error.generic"
	| "error.notFound"
	| "error.offline"

export type IllustrationEntry = VisualAssetEntry<IllustrationKey>

export const ILLUSTRATION_REGISTRY: Record<IllustrationKey, IllustrationEntry> = {
	"empty.savedListings": {
		key: "empty.savedListings",
		label: "No saved listings yet",
		description: "Seeker saved/favorites empty state.",
		category: "empty state",
		streamline: "heart pin / bookmark",
		keywords: ["saved", "favorites", "bookmark", "heart", "empty"],
		cloudinaryId: "Style-Three-Pin-Heart--Streamline-Freehand_hzjmax",
		decorative: true,
	},
	"empty.applications": {
		key: "empty.applications",
		label: "No applications yet",
		description: "Seeker applied list empty state.",
		category: "empty state",
		streamline: "magnifier + briefcase",
		keywords: ["applications", "applied", "job search", "empty"],
		cloudinaryId: "Job-Search-Magnifier-Briefcase--Streamline-Freehand_jvsgve",
		decorative: true,
	},
	"empty.offers": {
		key: "empty.offers",
		label: "No offers yet",
		description: "Seeker offered list empty state.",
		category: "empty state",
		streamline: "approved paper",
		keywords: ["offers", "offered", "approval", "empty"],
		cloudinaryId: "Notes-Paper-Approve--Streamline-Freehand_fjiksx",
		decorative: true,
	},
	"empty.accepted": {
		key: "empty.accepted",
		label: "Nothing accepted yet",
		description: "Seeker accepted list empty state.",
		category: "empty state",
		streamline: "trekking goal / summit flag",
		keywords: ["accepted", "goal", "summit", "empty"],
		cloudinaryId: "Trekking-Goal--Streamline-Freehand_qg8kpp",
		decorative: true,
	},
	"empty.notSelected": {
		key: "empty.notSelected",
		label: "Nothing here right now",
		description: "Seeker not-selected list empty state (kept gentle).",
		category: "empty state",
		streamline: "person at a door",
		keywords: ["not selected", "rejected", "closed", "empty"],
		cloudinaryId: "Worker-Lay-Off-Fired-User-Sad-Door--Streamline-Freehand_qpbpiz",
		decorative: true,
	},
	"empty.withdrawn": {
		key: "empty.withdrawn",
		label: "No withdrawn applications",
		description: "Seeker withdrawn list empty state.",
		category: "empty state",
		streamline: "door / step back",
		keywords: ["withdrawn", "exit", "door", "empty"],
		cloudinaryId: "Login-Logout-Door--Streamline-Freehand_zzxqel",
		decorative: true,
	},
	"empty.invites": {
		key: "empty.invites",
		label: "No invites yet",
		description: "Seeker invites empty state.",
		category: "empty state",
		streamline: "paper plane",
		keywords: ["invites", "invitation", "send", "empty"],
		cloudinaryId: "Send-Email-Paper-Plane-2--Streamline-Freehand_xtierd",
		decorative: true,
	},
	"empty.messages": {
		key: "empty.messages",
		label: "No messages yet",
		description: "Messages thread/transcript empty state.",
		category: "empty state",
		streamline: "chat bubble",
		keywords: ["messages", "chat", "conversation", "empty"],
		cloudinaryId: "Conversation-Text-1--Streamline-Freehand_d4hl32",
		decorative: true,
	},
	"empty.notifications": {
		key: "empty.notifications",
		label: "You're all caught up",
		description: "Notifications empty state.",
		category: "empty state",
		streamline: "bell",
		keywords: ["notifications", "bell", "alerts", "empty"],
		cloudinaryId: "Alert-Alarm-Bell--Streamline-Freehand_jdqyjr",
		decorative: true,
	},
	"empty.schedule": {
		key: "empty.schedule",
		label: "Nothing scheduled yet",
		description: "Schedule / journey empty state.",
		category: "empty state",
		streamline: "calendar",
		keywords: ["schedule", "calendar", "dates", "empty"],
		cloudinaryId: "Calendar-First--Streamline-Freehand",
		decorative: true,
	},
	"empty.community": {
		key: "empty.community",
		label: "No posts yet",
		description: "Community feed empty state.",
		category: "empty state",
		streamline: "team meeting",
		keywords: ["community", "feed", "team", "people", "empty"],
		cloudinaryId: "Meeting-Team--Streamline-Freehand_tyigsb",
		decorative: true,
	},
	"empty.photos": {
		key: "empty.photos",
		label: "No photos yet",
		description: "Community photos empty state.",
		category: "empty state",
		streamline: "stacked photos",
		keywords: ["photos", "gallery", "pictures", "empty"],
		cloudinaryId: "Picture-Stack-Human--Streamline-Freehand_aotmcf",
		decorative: true,
	},
	"empty.announcements": {
		key: "empty.announcements",
		label: "No announcements yet",
		description: "Community announcements empty state.",
		category: "empty state",
		streamline: "megaphone bubble",
		keywords: ["announcements", "megaphone", "news", "empty"],
		cloudinaryId: "Advertising-Megaphone-Bubble--Streamline-Freehand_tgtvha",
		decorative: true,
	},
	"empty.searchNoResults": {
		key: "empty.searchNoResults",
		label: "No matches found",
		description: "Search / discovery zero-results state.",
		category: "no results",
		streamline: "magnifier",
		keywords: ["search", "no results", "empty", "filter"],
		cloudinaryId: "Search-Magnifier--Streamline-Freehand_bikyxj",
		decorative: true,
	},
	"empty.hostListings": {
		key: "empty.hostListings",
		label: "No listings yet",
		description: "Host listings manager empty state (new host).",
		category: "empty state",
		streamline: "open shop sign",
		keywords: ["listings", "host", "shop", "open", "empty"],
		cloudinaryId: "Shop-Sign-Open--Streamline-Freehand_i7cxkb",
		decorative: true,
	},
	"empty.hostApplicants": {
		key: "empty.hostApplicants",
		label: "No applicants yet",
		description: "Host applicants empty state.",
		category: "empty state",
		streamline: "team search",
		keywords: ["applicants", "candidates", "team", "empty"],
		cloudinaryId: "Job-Seach-Team-Man--Streamline-Freehand_gncbfp",
		decorative: true,
	},
	"empty.map": {
		key: "empty.map",
		label: "Nothing on the map here",
		description: "Map view empty/zero-results state.",
		category: "no results",
		streamline: "globe with location",
		keywords: ["map", "globe", "location", "empty"],
		cloudinaryId: "Earth-Globe-Model-Location-Arrow--Streamline-Freehand_ldprba",
		decorative: true,
	},
	"onboarding.seeker": {
		key: "onboarding.seeker",
		label: "Start your journey",
		description: "Seeker onboarding welcome art.",
		category: "onboarding",
		streamline: "backpack / travel",
		keywords: ["onboarding", "seeker", "backpack", "start", "travel"],
		cloudinaryId: "Outdoors-Backpack--Streamline-Freehand_pzrfnw",
		decorative: true,
	},
	"onboarding.host": {
		key: "onboarding.host",
		label: "Set up your place",
		description: "Host onboarding welcome art.",
		category: "onboarding",
		streamline: "modern house",
		keywords: ["onboarding", "host", "house", "property", "start"],
		cloudinaryId: "House-Modern-1--Streamline-Freehand_bow1jh",
		decorative: true,
	},
	"hero.discover": {
		key: "hero.discover",
		label: "Discover opportunities",
		description: "Discovery / home hero accent.",
		category: "hero",
		streamline: "telescope person",
		keywords: ["discover", "explore", "telescope", "hero"],
		cloudinaryId: "Landmarks-Telescope-Person--Streamline-Freehand_zuwedm",
		decorative: true,
	},
	"hero.adventure": {
		key: "hero.adventure",
		label: "Adventure awaits",
		description: "Marketing / seasonal hero accent.",
		category: "hero",
		streamline: "climbing mountain",
		keywords: ["adventure", "mountain", "climb", "hero"],
		cloudinaryId: "Climbing-Mountain--Streamline-Freehand_smfygx",
		decorative: true,
	},
	"hero.maritime": {
		key: "hero.maritime",
		label: "Out on the water",
		description: "Maritime category hero accent.",
		category: "hero",
		streamline: "sailing boat person",
		keywords: ["maritime", "boat", "sailing", "hero"],
		cloudinaryId: "Sailing-Boat-Person--Streamline-Freehand_g4qyjl",
		decorative: true,
	},
	"hero.camp": {
		key: "hero.camp",
		label: "Basecamp",
		description: "Seasonal / outdoors hero accent.",
		category: "hero",
		streamline: "camping tent",
		keywords: ["camp", "tent", "outdoors", "seasonal", "hero"],
		cloudinaryId: "Camping-Tent-2--Streamline-Freehand_go5xf7",
		decorative: true,
	},
	"success.applicationSubmitted": {
		key: "success.applicationSubmitted",
		label: "Application sent",
		description: "Application submitted success art.",
		category: "success",
		streamline: "paper plane",
		keywords: ["success", "applied", "submitted", "sent"],
		cloudinaryId: "Send-Email-Paper-Plane-3--Streamline-Freehand_ey3knh",
		decorative: true,
	},
	"success.offerReceived": {
		key: "success.offerReceived",
		label: "You got an offer",
		description: "Offer received success art.",
		category: "success",
		streamline: "approved paper",
		keywords: ["success", "offer", "received", "approved"],
		cloudinaryId: "Notes-Paper-Approve--Streamline-Freehand_fjiksx",
		decorative: true,
	},
	"success.profileComplete": {
		key: "success.profileComplete",
		label: "Profile complete",
		description: "Profile/resume completion success art.",
		category: "success",
		streamline: "success stairs",
		keywords: ["success", "profile", "complete", "progress"],
		cloudinaryId: "Strategy-Business-Success-Stairs--Streamline-Freehand_qnckae",
		decorative: true,
	},
	"success.listingPublished": {
		key: "success.listingPublished",
		label: "Listing published",
		description: "Host listing published success art.",
		category: "success",
		streamline: "product launch",
		keywords: ["success", "listing", "published", "launch"],
		cloudinaryId: "Product-Launch-Browser--Streamline-Freehand_mlkdqz",
		decorative: true,
	},
	"error.generic": {
		key: "error.generic",
		label: "Something went wrong",
		description: "Generic error boundary art.",
		category: "error",
		streamline: "error document",
		keywords: ["error", "problem", "document", "fail"],
		cloudinaryId: "Server-Error-Document--Streamline-Freehand_klrnwy",
		decorative: true,
	},
	"error.notFound": {
		key: "error.notFound",
		label: "Page not found",
		description: "404 not-found art.",
		category: "error",
		streamline: "404",
		keywords: ["404", "not found", "missing", "error"],
		cloudinaryId: "Server-Error-404-Not-Found--Streamline-Freehand_cxwnrp",
		decorative: true,
	},
	"error.offline": {
		key: "error.offline",
		label: "You're offline",
		description: "Offline / connectivity error art.",
		category: "error",
		streamline: "wifi off",
		keywords: ["offline", "wifi", "connection", "error"],
		cloudinaryId: "Wifi-Off--Streamline-Freehand_vpfvmg",
		decorative: true,
	},
}

/** Ordered list of every illustration key (kept in sync with the union by the type-test). */
export const ILLUSTRATION_KEYS = [
	"empty.savedListings",
	"empty.applications",
	"empty.offers",
	"empty.accepted",
	"empty.notSelected",
	"empty.withdrawn",
	"empty.invites",
	"empty.messages",
	"empty.notifications",
	"empty.schedule",
	"empty.community",
	"empty.photos",
	"empty.announcements",
	"empty.searchNoResults",
	"empty.hostListings",
	"empty.hostApplicants",
	"empty.map",
	"onboarding.seeker",
	"onboarding.host",
	"hero.discover",
	"hero.adventure",
	"hero.maritime",
	"hero.camp",
	"success.applicationSubmitted",
	"success.offerReceived",
	"success.profileComplete",
	"success.listingPublished",
	"error.generic",
	"error.notFound",
	"error.offline",
] as const satisfies readonly IllustrationKey[]

/** Resolve an illustration entry by key. */
export function getIllustration(key: IllustrationKey): IllustrationEntry {
	return ILLUSTRATION_REGISTRY[key]
}
