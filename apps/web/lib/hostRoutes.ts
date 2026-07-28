/**
 * Path segments under /host/* that belong to the private, auth-gated host
 * dashboard — as opposed to the public /host/{id} host-profile route, which
 * shares the same URL prefix but must stay crawlable and keep its normal
 * public chrome (see apps/web/app/host/[id]/page.tsx).
 *
 * Single source of truth for this distinction: previously robots.txt and
 * HideOnHost each re-derived it independently (a blanket `/host/` prefix
 * match), which is what let /host/{id} get swept up as "private" in both
 * places. Keep this list in sync with the route segments under
 * apps/web/app/(host)/host/*.
 */
export const HOST_DASHBOARD_SEGMENTS = [
  "analytics",
  "announcements",
  "applicants",
  // Legacy aliases (renamed by D17 to outreach/coach). Retained deliberately:
  // the next.config redirects mean nothing RENDERS at these paths any more, but
  // a crawler working from a cached index still REQUESTS them, and this list is
  // what robots.txt and HideOnHost use to decide "private". Dropping them would
  // briefly advertise two host-dashboard URLs as public.
  "assistant",
  "billing",
  "coach",
  "help",
  "invites",
  "listings",
  "messages",
  "onboarding",
  "outreach",
  // Plan selection before a host profile exists. Sits in the (host-onboard)
  // group with onboarding — outside the profile gate — but it is still a
  // signed-in surface, not the public /host/{id} profile, so it belongs here.
  "plans",
  "profile",
  "seeker",
  "settings",
] as const;

/** True for the private dashboard home (`/host`) and any dashboard sub-route. */
export function isPrivateHostDashboardPath(pathname: string): boolean {
  if (pathname === "/host") {
    return true;
  }
  return HOST_DASHBOARD_SEGMENTS.some(
    (segment) =>
      pathname === `/host/${segment}` || pathname.startsWith(`/host/${segment}/`),
  );
}
