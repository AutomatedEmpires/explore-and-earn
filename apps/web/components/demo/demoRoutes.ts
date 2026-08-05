/**
 * Canonical application destinations mapped into the isolated public demos.
 *
 * The shells continue to own the real information architecture; demo routes
 * only replace the destination. Keeping this map explicit makes every visible
 * control testable and prevents a demo visitor from falling into an authed or
 * production-data route.
 */
export const HOST_DEMO_ROUTE_MAP: Readonly<Record<string, string>> = {
  "/host": "/for-hosts/demo",
  "/host/listings": "/for-hosts/demo/listings",
  "/host/listings/new": "/for-hosts/demo/listings/new",
  "/host/applicants": "/for-hosts/demo/applicants",
  "/host/outreach": "/for-hosts/demo/outreach",
  "/host/messages": "/for-hosts/demo/messages",
  "/host/notifications": "/for-hosts/demo/notifications",
  "/host/announcements": "/for-hosts/demo/announcements",
  "/host/analytics": "/for-hosts/demo/analytics",
  "/host/profile": "/for-hosts/demo/profile",
  "/host/profile/edit": "/for-hosts/demo/profile/edit",
  "/host/billing": "/for-hosts/demo/billing",
  "/host/plans": "/for-hosts/demo/plan",
  "/host/coach": "/for-hosts/demo/coach",
  "/host/settings": "/for-hosts/demo/settings",
  "/host/help": "/for-hosts/demo/help",
};

export const SEEKER_DEMO_ROUTE_MAP: Readonly<Record<string, string>> = {
  "/home": "/for-seekers/demo",
  "/seek": "/for-seekers/demo/seek",
  "/swipe": "/for-seekers/demo/swipe",
  "/map": "/for-seekers/demo/map",
  "/assistant": "/for-seekers/demo/assistant",
  "/resume": "/for-seekers/demo/resume",
  "/profile/edit": "/for-seekers/demo/profile/edit",
  "/saved": "/for-seekers/demo/saved",
  "/applied": "/for-seekers/demo/applied",
  "/invites": "/for-seekers/demo/invites",
  "/offered": "/for-seekers/demo/offers",
  "/accepted": "/for-seekers/demo/accepted",
  "/not-selected": "/for-seekers/demo/not-selected",
  "/withdrawn": "/for-seekers/demo/withdrawn",
  "/messages": "/for-seekers/demo/messages",
  "/community": "/for-seekers/demo/community",
  "/journey": "/for-seekers/demo/journey",
  "/travel": "/for-seekers/demo/schedule",
  "/schedule": "/for-seekers/demo/schedule",
  "/badges": "/for-seekers/demo/badges",
  "/notifications": "/for-seekers/demo/notifications",
  "/settings": "/for-seekers/demo/settings",
  "/help": "/for-seekers/demo/help",
  "/profile": "/for-seekers/demo/profile",
};

export function demoRoute(
  map: Readonly<Record<string, string>>,
  canonicalHref: string,
): string {
  return map[canonicalHref] ?? canonicalHref;
}
