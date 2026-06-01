import { routes } from "../../lib/routes";
import type { RouteGroup } from "../../lib/routes";

// Navigation models per audience.
// Source of truth: docs/ux/app-shell-and-navigation.md (Notion: Navigation Architecture Doctrine, UX Surface Inventory).
// SCOPE: typed config only. No rendering, no active-state, no routing logic. Consumed later by AppHeader/BottomNav.

export type NavItem = {
  /** Stable identifier (not the label). */
  key: string;
  label: string;
  /** Target route, or an overlay placeholder route pending wiring (see `overlayKey`). */
  href: string;
  /** If set, this item opens an overlay rather than navigating. See overlays.ts. */
  overlayKey?: string;
};

// Seeker bottom nav order is LOCKED (A-FE-SEEKER-NAV-ORDER, 2026-05-31). Community is intentionally excluded.
export const seekerBottomNav: readonly NavItem[] = [
  { key: "explore", label: "Explore", href: routes.explore },
  { key: "saved", label: "Saved", href: routes.seekerSaved },
  { key: "applications", label: "Applications", href: routes.seekerApplications },
  { key: "offers", label: "Offers", href: routes.seekerOffers },
  { key: "profile", label: "Profile", href: routes.seekerProfile },
];

// Host bottom nav follows Navigation Doctrine (not separately founder-locked).
// "More" opens the Host More overlay; V1 routes Offers/Profile are reachable there or via header.
export const hostBottomNav: readonly NavItem[] = [
  { key: "home", label: "Home", href: routes.host },
  { key: "listings", label: "Listings", href: routes.hostListings },
  { key: "applicants", label: "Applicants", href: routes.hostApplicants },
  { key: "analytics", label: "Analytics", href: routes.hostAnalytics },
  { key: "more", label: "More", href: routes.host, overlayKey: "hostMore" },
];

// Logged-out global nav (shared by (marketing) + (public)).
export const publicGlobalNav: readonly NavItem[] = [
  { key: "explore", label: "Explore", href: routes.explore },
  // TODO(?): confirm the "For Hosts" target (a marketing host landing page vs the host app entry). Canon names the item, not the URL.
  { key: "for-hosts", label: "For Hosts", href: routes.host },
  { key: "pricing", label: "Pricing", href: routes.pricing },
  { key: "about", label: "About", href: routes.about },
];

export const navByGroup: Partial<Record<RouteGroup, readonly NavItem[]>> = {
  marketing: publicGlobalNav,
  public: publicGlobalNav,
  seeker: seekerBottomNav,
  host: hostBottomNav,
};
