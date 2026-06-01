import { routes } from "../../lib/routes";
import type { RouteGroup } from "../../lib/routes";
import type { OverlayKey } from "./overlays";

// Navigation configuration — typed source of the app-shell's nav surfaces.
// Source of truth: docs/ux/app-shell-and-navigation.md (Notion: Navigation Architecture Doctrine).
//
// Orders here are LOCKED by founder decisions (PR #8):
//   - A-FE-SEEKER-NAV-ORDER: Explore -> Saved -> Applications -> Offers -> Profile.
// An item with an `overlayKey` opens an overlay (see overlays.ts) instead of navigating.

export type NavItem = {
	key: string;
	label: string;
	href: string;
	/** When set, the item opens this overlay instead of navigating. */
	overlayKey?: OverlayKey;
};

// Seeker mobile primary navigation (LOCKED order). Community is intentionally absent.
export const seekerBottomNav: readonly NavItem[] = [
	{ key: "explore", label: "Explore", href: routes.explore },
	{ key: "saved", label: "Saved", href: routes.seekerSaved },
	{ key: "applications", label: "Applications", href: routes.seekerApplications },
	{ key: "offers", label: "Offers", href: routes.seekerOffers },
	{ key: "profile", label: "Profile", href: routes.seekerProfile },
];

// Host mobile primary navigation (Navigation Doctrine: Home / Listings / Applicants / Analytics / More).
// "More" opens the host overflow overlay rather than navigating.
export const hostBottomNav: readonly NavItem[] = [
	{ key: "home", label: "Home", href: routes.host },
	{ key: "listings", label: "Listings", href: routes.hostListings },
	{ key: "applicants", label: "Applicants", href: routes.hostApplicants },
	{ key: "analytics", label: "Analytics", href: routes.hostAnalytics },
	{ key: "more", label: "More", href: routes.host, overlayKey: "hostMore" },
];

// Marketing/public (logged-out) top navigation.
export const publicGlobalNav: readonly NavItem[] = [
	{ key: "explore", label: "Explore", href: routes.explore },
	{ key: "how-it-works", label: "How it works", href: routes.howItWorks },
	{ key: "pricing", label: "Pricing", href: routes.pricing },
	{ key: "about", label: "About", href: routes.about },
	{ key: "for-hosts", label: "For hosts", href: routes.host },
];

// Top (header) navigation by route group. Only logged-out brand surfaces carry
// top nav in V1; seeker/host lead with the bottom nav; admin/community/demo are brand-only.
export const headerNavByGroup: Partial<Record<RouteGroup, readonly NavItem[]>> = {
	marketing: publicGlobalNav,
	public: publicGlobalNav,
};

// Mobile primary (bottom) navigation by route group. Only seeker/host in V1.
export const bottomNavByGroup: Partial<Record<RouteGroup, readonly NavItem[]>> = {
	seeker: seekerBottomNav,
	host: hostBottomNav,
};
