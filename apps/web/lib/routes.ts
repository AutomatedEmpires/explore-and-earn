// Canonical V1 route table as typed constants.
// Source of truth: docs/ux/route-map.md (founder-locked 2026-05-31).
// Feature agents: import paths from here — do NOT hardcode path strings in surfaces.
// SCOPE: constants + types only. No routing logic, no data, no auth, no redirects.

/** Static V1 routes, keyed by a stable identifier. */
export const routes = {
  // (marketing)
  home: "/",
  about: "/about",
  howItWorks: "/how-it-works",
  pricing: "/pricing",
  // (public)
  explore: "/explore",
  // (seeker)
  seeker: "/seeker",
  seekerSaved: "/seeker/saved",
  seekerApplications: "/seeker/applications",
  seekerOffers: "/seeker/offers",
  seekerProfile: "/seeker/profile",
  // (host)
  host: "/host",
  hostListings: "/host/listings",
  hostApplicants: "/host/applicants",
  hostOffers: "/host/offers",
  hostProfile: "/host/profile",
  hostAnalytics: "/host/analytics",
  // (admin)
  admin: "/admin",
  // (community) — keep V1 light
  community: "/community",
  // (demo) — no tier routing in V1
  demo: "/demo",
  demoDesignSystem: "/demo/design-system",
  demoDiscoveryCard: "/demo/discovery-card",
  demoListingDetail: "/demo/listing-detail",
  demoSeekerDashboard: "/demo/seeker-dashboard",
  demoHostDashboard: "/demo/host-dashboard",
} as const;

/** Dynamic routes (param builders). Listing detail also has an in-app overlay mode — see docs/ux/modal-sheet-system.md. */
export const dynamicRoutes = {
  opportunity: (slug: string): string => `/opportunities/${slug}`,
  hostProfilePublic: (slug: string): string => `/hosts/${slug}`,
} as const;

export type StaticRouteKey = keyof typeof routes;
export type StaticRoute = (typeof routes)[StaticRouteKey];

/** Next App Router route groups. Groups scope layout/nav chrome; they do NOT affect the URL path. */
export type RouteGroup =
  | "marketing"
  | "public"
  | "seeker"
  | "host"
  | "admin"
  | "community"
  | "demo";
