/**
 * Illustration registry — spot art for empty states, onboarding, heroes,
 * success moments, and error pages. Rendered large inside a framed paper
 * plate by <AppIllustration>.
 *
 * Each entry maps to a semantic key in the canonical Phosphor icon registry
 * (packages/ui/src/icons) — rendered locally, no network, no paid assets.
 * To swap art globally, change one `icon` here; no component edits.
 */

import type { IconKey } from "../icons"
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

export interface IllustrationEntry extends VisualAssetEntry<IllustrationKey> {
	icon: IconKey
}

export const ILLUSTRATION_REGISTRY: Record<IllustrationKey, IllustrationEntry> = {
	"empty.savedListings": {
		key: "empty.savedListings",
		label: "No saved listings yet",
		description: "Seeker saved/favorites empty state.",
		category: "empty state",
		icon: "nav.saved",
		keywords: ["saved", "favorites", "bookmark", "heart", "empty"],
		decorative: true,
	},
	"empty.applications": {
		key: "empty.applications",
		label: "No applications yet",
		description: "Seeker applied list empty state.",
		category: "empty state",
		icon: "status.applied",
		keywords: ["applications", "applied", "job search", "empty"],
		decorative: true,
	},
	"empty.offers": {
		key: "empty.offers",
		label: "No offers yet",
		description: "Seeker offered list empty state.",
		category: "empty state",
		icon: "status.offered",
		keywords: ["offers", "offered", "approval", "empty"],
		decorative: true,
	},
	"empty.accepted": {
		key: "empty.accepted",
		label: "Nothing accepted yet",
		description: "Seeker accepted list empty state.",
		category: "empty state",
		icon: "status.accepted",
		keywords: ["accepted", "goal", "summit", "empty"],
		decorative: true,
	},
	"empty.notSelected": {
		key: "empty.notSelected",
		label: "Nothing here right now",
		description: "Seeker not-selected list empty state (kept gentle).",
		category: "empty state",
		icon: "status.declined",
		keywords: ["not selected", "closed", "empty"],
		decorative: true,
	},
	"empty.withdrawn": {
		key: "empty.withdrawn",
		label: "No withdrawn applications",
		description: "Seeker withdrawn list empty state.",
		category: "empty state",
		icon: "status.withdrawn",
		keywords: ["withdrawn", "exit", "empty"],
		decorative: true,
	},
	"empty.invites": {
		key: "empty.invites",
		label: "No invites yet",
		description: "Seeker invites empty state.",
		category: "empty state",
		icon: "action.message",
		keywords: ["invites", "invitation", "empty"],
		decorative: true,
	},
	"empty.messages": {
		key: "empty.messages",
		label: "No messages yet",
		description: "Messaging empty state (seeker + host).",
		category: "empty state",
		icon: "nav.messages",
		keywords: ["messages", "chat", "inbox", "empty"],
		decorative: true,
	},
	"empty.notifications": {
		key: "empty.notifications",
		label: "You're all caught up",
		description: "Notifications empty state.",
		category: "empty state",
		icon: "nav.notifications",
		keywords: ["notifications", "bell", "empty"],
		decorative: true,
	},
	"empty.schedule": {
		key: "empty.schedule",
		label: "Nothing scheduled yet",
		description: "Seeker schedule/timeline empty state.",
		category: "empty state",
		icon: "status.begins",
		keywords: ["schedule", "calendar", "timeline", "empty"],
		decorative: true,
	},
	"empty.community": {
		key: "empty.community",
		label: "The campfire is quiet",
		description: "Community feed empty state.",
		category: "empty state",
		icon: "nav.feed",
		keywords: ["community", "feed", "empty"],
		decorative: true,
	},
	"empty.photos": {
		key: "empty.photos",
		label: "No photos shared yet",
		description: "Community photos empty state.",
		category: "empty state",
		icon: "nav.photos",
		keywords: ["photos", "camera", "empty"],
		decorative: true,
	},
	"empty.announcements": {
		key: "empty.announcements",
		label: "No announcements yet",
		description: "Community/host announcements empty state.",
		category: "empty state",
		icon: "nav.announcements",
		keywords: ["announcements", "megaphone", "empty"],
		decorative: true,
	},
	"empty.searchNoResults": {
		key: "empty.searchNoResults",
		label: "No matches for this search",
		description: "Discovery/search zero-results state.",
		category: "empty state",
		icon: "action.search",
		keywords: ["search", "no results", "empty"],
		decorative: true,
	},
	"empty.hostListings": {
		key: "empty.hostListings",
		label: "No listings yet",
		description: "Host listings manager empty state.",
		category: "empty state",
		icon: "status.open",
		keywords: ["listings", "host", "roles", "empty"],
		decorative: true,
	},
	"empty.hostApplicants": {
		key: "empty.hostApplicants",
		label: "No applicants yet",
		description: "Host applicant pipeline empty state.",
		category: "empty state",
		icon: "nav.seekers",
		keywords: ["applicants", "candidates", "empty"],
		decorative: true,
	},
	"empty.map": {
		key: "empty.map",
		label: "No mapped opportunities here",
		description: "Map surface zero-results state.",
		category: "empty state",
		icon: "nav.map",
		keywords: ["map", "location", "empty"],
		decorative: true,
	},
	"onboarding.seeker": {
		key: "onboarding.seeker",
		label: "Set up your seeker profile",
		description: "Seeker onboarding accent.",
		category: "onboarding",
		icon: "nav.profile",
		keywords: ["onboarding", "seeker", "profile"],
		decorative: true,
	},
	"onboarding.host": {
		key: "onboarding.host",
		label: "Set up your host profile",
		description: "Host onboarding accent.",
		category: "onboarding",
		icon: "nav.host",
		keywords: ["onboarding", "host", "profile"],
		decorative: true,
	},
	"hero.discover": {
		key: "hero.discover",
		label: "Discover opportunities",
		description: "Discovery hero accent.",
		category: "hero",
		icon: "nav.seek",
		keywords: ["discover", "compass", "hero"],
		decorative: true,
	},
	"hero.adventure": {
		key: "hero.adventure",
		label: "Adventure awaits",
		description: "Marketing hero accent.",
		category: "hero",
		icon: "category.seasonal",
		keywords: ["adventure", "mountains", "hero"],
		decorative: true,
	},
	"hero.maritime": {
		key: "hero.maritime",
		label: "Work the water",
		description: "Maritime hero accent.",
		category: "hero",
		icon: "category.maritime",
		keywords: ["maritime", "boat", "hero"],
		decorative: true,
	},
	"hero.camp": {
		key: "hero.camp",
		label: "Live where you work",
		description: "Camp/remote hero accent.",
		category: "hero",
		icon: "category.remote",
		keywords: ["camp", "remote", "hero"],
		decorative: true,
	},
	"success.applicationSubmitted": {
		key: "success.applicationSubmitted",
		label: "Application submitted",
		description: "Post-apply success moment.",
		category: "success",
		icon: "system.success",
		keywords: ["success", "applied", "submitted"],
		decorative: true,
	},
	"success.offerReceived": {
		key: "success.offerReceived",
		label: "You have an offer",
		description: "Offer-received success moment.",
		category: "success",
		icon: "status.offered",
		keywords: ["success", "offer"],
		decorative: true,
	},
	"success.profileComplete": {
		key: "success.profileComplete",
		label: "Profile complete",
		description: "Profile completion success moment.",
		category: "success",
		icon: "profile.verification",
		keywords: ["success", "profile", "complete"],
		decorative: true,
	},
	"success.listingPublished": {
		key: "success.listingPublished",
		label: "Listing published",
		description: "Host listing-published success moment.",
		category: "success",
		icon: "status.featured",
		keywords: ["success", "listing", "published"],
		decorative: true,
	},
	"error.generic": {
		key: "error.generic",
		label: "Something went wrong",
		description: "Generic error boundary art.",
		category: "error",
		icon: "system.error",
		keywords: ["error", "problem"],
		decorative: true,
	},
	"error.notFound": {
		key: "error.notFound",
		label: "Page not found",
		description: "404 art.",
		category: "error",
		icon: "system.warning",
		keywords: ["404", "not found", "error"],
		decorative: true,
	},
	"error.offline": {
		key: "error.offline",
		label: "You're offline",
		description: "Offline/connection error art.",
		category: "error",
		icon: "benefit.wifi",
		keywords: ["offline", "connection", "error"],
		decorative: true,
	},
}

/**
 * Complete key list — paired with the compile-time completeness test in
 * __type-tests__/registries.type-test.ts.
 */
export const ILLUSTRATION_KEYS = Object.keys(
	ILLUSTRATION_REGISTRY,
) as readonly IllustrationKey[]

/** Resolve an illustration entry by key. */
export function getIllustration(key: IllustrationKey): IllustrationEntry {
	return ILLUSTRATION_REGISTRY[key]
}
