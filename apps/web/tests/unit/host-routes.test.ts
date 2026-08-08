import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  HOST_DASHBOARD_SEGMENTS,
  isPrivateHostDashboardPath,
} from "../../lib/hostRoutes";

const hostOverview = readFileSync(
  new URL("../../app/[locale]/(host)/host/page.tsx", import.meta.url),
  "utf8",
);
const hostShell = readFileSync(
  new URL("../../components/host/HostShell.tsx", import.meta.url),
  "utf8",
);
const hostCoach = readFileSync(
  new URL("../../app/[locale]/(host)/host/coach/page.tsx", import.meta.url),
  "utf8",
);
const hostSeeker = readFileSync(
  new URL("../../app/[locale]/(host)/host/seeker/[id]/page.tsx", import.meta.url),
  "utf8",
);

describe("private host dashboard routes", () => {
  it("owns exactly one main landmark in the shared host shell", () => {
    expect(hostShell).toContain('<main className={styles.content}>');
    expect(hostCoach).not.toContain("<main");
    expect(hostSeeker).not.toContain("<main");
  });

  it("renders deterministic review state before starting host data reads", () => {
    const devGate = hostOverview.indexOf(
      'isDevBenchEnabled() && (await readDevRole()) === "host"',
    );
    const devHostRead = hostOverview.indexOf("devHostProfile()", devGate);
    const authRead = hostOverview.indexOf("await auth()", devGate);

    expect(devGate).toBeGreaterThan(-1);
    expect(devHostRead).toBeGreaterThan(devGate);
    expect(authRead).toBeGreaterThan(devGate);
    expect(devHostRead).toBeLessThan(authRead);
  });

  it.each([
    "/host",
    "/host/applicants",
    "/host/applicants/application-id",
    "/host/coach",
    "/host/checkout",
    "/host/outreach",
    "/host/messages/thread-id",
    "/host/notifications",
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
    expect(HOST_DASHBOARD_SEGMENTS).toContain("checkout");
    expect(HOST_DASHBOARD_SEGMENTS).toContain("notifications");
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
