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
    "/host/assistant",
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
    expect(HOST_DASHBOARD_SEGMENTS).toContain("assistant");
  });
});
