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
  "assistant",
  "billing",
  "help",
  "invites",
  "listings",
  "messages",
  "onboarding",
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
