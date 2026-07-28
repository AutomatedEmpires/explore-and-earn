import { describe, expect, it } from "vitest";

import {
  HOST_DASHBOARD_SEGMENTS,
  isPrivateHostDashboardPath,
} from "../../lib/hostRoutes";

describe("private host dashboard routes", () => {
  it.each([
    "/host",
    "/host/applicants",
    "/host/applicants/application-id",
    "/host/coach",
    "/host/outreach",
    "/host/messages/thread-id",
  ])("recognizes %s as private", (pathname) => {
    expect(isPrivateHostDashboardPath(pathname)).toBe(true);
  });

  it.each(["/host/public-profile-id", "/hostess", "/for-hosts"])(
    "keeps %s public",
    (pathname) => {
      expect(isPrivateHostDashboardPath(pathname)).toBe(false);
    },
  );

  it("tracks every current private host route segment", () => {
    expect(HOST_DASHBOARD_SEGMENTS).toContain("coach");
    expect(HOST_DASHBOARD_SEGMENTS).toContain("outreach");
  });

  /**
   * The D17 renames are redirected, not deleted. A crawler working from a
   * cached index still REQUESTS the old paths, and this list is what robots.txt
   * and HideOnHost consult to decide "private" — so dropping the old segments
   * would briefly advertise two host-dashboard URLs as public pages.
   */
  it.each(["/host/invites", "/host/assistant"])(
    "still treats the pre-rename path %s as private",
    (pathname) => {
      expect(isPrivateHostDashboardPath(pathname)).toBe(true);
    },
  );
});
