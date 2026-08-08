import { beforeEach, describe, expect, it, vi } from "vitest";

const optionalAuthMock = vi.hoisted(() => vi.fn());
const isAdminUserIdMock = vi.hoisted(() => vi.fn());
const hasHostProfileMock = vi.hoisted(() => vi.fn());

vi.mock("../../lib/optionalAuth", () => ({ optionalAuth: optionalAuthMock }));
vi.mock("../../lib/admin", () => ({ isAdminUserId: isAdminUserIdMock }));
vi.mock("@explore-and-earn/db", () => ({
  hasHostProfile: hasHostProfileMock,
}));

import {
  PUBLIC_ROLE_DESTINATIONS,
  deriveClerkViewerSnapshot,
  isCurrentViewerRequest,
  isViewerNavigationResponse,
} from "../../lib/publicNavigation";

const { GET } = await import("../../app/api/viewer/navigation/route");

const getTokenMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  getTokenMock.mockResolvedValue("clerk-token");
  optionalAuthMock.mockResolvedValue({
    userId: "user_seeker",
    getToken: getTokenMock,
  });
  isAdminUserIdMock.mockReturnValue(false);
  hasHostProfileMock.mockResolvedValue(false);
});

async function expectPrivateResponse(
  response: Response,
  status: number,
  body: Record<string, string>,
): Promise<void> {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Cookie");
  await expect(response.json()).resolves.toEqual(body);
}

describe("public navigation contract", () => {
  it("maps each role to its canonical shared-chrome destinations", () => {
    expect(PUBLIC_ROLE_DESTINATIONS).toEqual({
      guest: {
        home: "/",
        profile: "/profile",
        notifications: "/notifications",
      },
      seeker: {
        home: "/",
        profile: "/profile",
        notifications: "/notifications",
      },
      host: {
        home: "/host/listings",
        profile: "/host/profile",
        notifications: "/host/notifications",
      },
      admin: {
        home: "/admin",
        profile: "/admin",
        notifications: "/admin/notifications",
      },
    });
  });

  it("accepts only exact authenticated role responses", () => {
    expect(isViewerNavigationResponse({ role: "seeker" })).toBe(true);
    expect(isViewerNavigationResponse({ role: "host" })).toBe(true);
    expect(isViewerNavigationResponse({ role: "admin" })).toBe(true);

    expect(isViewerNavigationResponse({ role: "guest" })).toBe(false);
    expect(isViewerNavigationResponse({ role: "host", userId: "secret" })).toBe(
      false,
    );
    expect(isViewerNavigationResponse({ role: "unknown" })).toBe(false);
    expect(isViewerNavigationResponse({})).toBe(false);
    expect(isViewerNavigationResponse(null)).toBe(false);
  });

  it("derives hydration, auth loading, sign-out, fallback, and resolved states", () => {
    expect(
      deriveClerkViewerSnapshot(
        {
          hydrated: false,
          isLoaded: true,
          isSignedIn: true,
          userId: "user-host",
        },
        { userId: "user-host", role: "host", state: "resolved" },
      ),
    ).toEqual({ role: "guest", state: "guest" });
    expect(
      deriveClerkViewerSnapshot(
        { hydrated: true, isLoaded: false },
        null,
      ),
    ).toEqual({ role: "guest", state: "checking-auth" });
    expect(
      deriveClerkViewerSnapshot(
        { hydrated: true, isLoaded: true, isSignedIn: false, userId: null },
        { userId: "old-user", role: "host", state: "resolved" },
      ),
    ).toEqual({ role: "guest", state: "guest" });
    expect(
      deriveClerkViewerSnapshot(
        {
          hydrated: true,
          isLoaded: true,
          isSignedIn: true,
          userId: "user-host",
        },
        null,
      ),
    ).toEqual({
      role: "seeker",
      state: "resolving",
      userId: "user-host",
    });
    expect(
      deriveClerkViewerSnapshot(
        {
          hydrated: true,
          isLoaded: true,
          isSignedIn: true,
          userId: "user-host",
        },
        { userId: "user-host", role: "host", state: "resolved" },
      ),
    ).toEqual({ role: "host", state: "resolved", userId: "user-host" });
    expect(
      deriveClerkViewerSnapshot(
        {
          hydrated: true,
          isLoaded: true,
          isSignedIn: true,
          userId: "user-admin",
        },
        { userId: "user-admin", role: "admin", state: "resolved" },
      ),
    ).toEqual({ role: "admin", state: "resolved", userId: "user-admin" });
    expect(
      deriveClerkViewerSnapshot(
        {
          hydrated: true,
          isLoaded: true,
          isSignedIn: true,
          userId: "user-seeker",
        },
        { userId: "user-seeker", role: null, state: "fallback" },
      ),
    ).toEqual({
      role: "seeker",
      state: "fallback",
      userId: "user-seeker",
    });
  });

  it("ignores stale user resolutions and rejects superseded requests", () => {
    expect(
      deriveClerkViewerSnapshot(
        {
          hydrated: true,
          isLoaded: true,
          isSignedIn: true,
          userId: "new-user",
        },
        { userId: "old-user", role: "host", state: "resolved" },
      ),
    ).toEqual({
      role: "seeker",
      state: "resolving",
      userId: "new-user",
    });
    expect(isCurrentViewerRequest("current-user", "current-user")).toBe(true);
    expect(isCurrentViewerRequest("other-user", "current-user")).toBe(false);
    expect(isCurrentViewerRequest(null, "current-user")).toBe(false);
  });
});

describe("GET /api/viewer/navigation", () => {
  it("returns 401 for a request without a session", async () => {
    optionalAuthMock.mockResolvedValue({ userId: null, getToken: null });

    const response = await GET();

    await expectPrivateResponse(response, 401, { error: "unauthorized" });
    expect(isAdminUserIdMock).not.toHaveBeenCalled();
    expect(getTokenMock).not.toHaveBeenCalled();
    expect(hasHostProfileMock).not.toHaveBeenCalled();
  });

  it("short-circuits an allow-listed admin before token and database reads", async () => {
    optionalAuthMock.mockResolvedValue({
      userId: "user_admin",
      getToken: getTokenMock,
    });
    isAdminUserIdMock.mockReturnValue(true);

    const response = await GET();

    await expectPrivateResponse(response, 200, { role: "admin" });
    expect(isAdminUserIdMock).toHaveBeenCalledWith("user_admin");
    expect(getTokenMock).not.toHaveBeenCalled();
    expect(hasHostProfileMock).not.toHaveBeenCalled();
  });

  it("resolves an active owned host profile as host", async () => {
    optionalAuthMock.mockResolvedValue({
      userId: "user_host",
      getToken: getTokenMock,
    });
    hasHostProfileMock.mockResolvedValue(true);

    const response = await GET();

    await expectPrivateResponse(response, 200, { role: "host" });
    expect(hasHostProfileMock).toHaveBeenCalledWith(
      "clerk-token",
      "user_host",
    );
  });

  it("resolves an authenticated user without a host profile as seeker", async () => {
    const response = await GET();

    await expectPrivateResponse(response, 200, { role: "seeker" });
    expect(hasHostProfileMock).toHaveBeenCalledWith(
      "clerk-token",
      "user_seeker",
    );
  });

  it("returns a generic 503 when no token reader is available", async () => {
    optionalAuthMock.mockResolvedValue({
      userId: "user_seeker",
      getToken: null,
    });

    const response = await GET();

    await expectPrivateResponse(response, 503, {
      error: "navigation_unavailable",
    });
    expect(hasHostProfileMock).not.toHaveBeenCalled();
  });

  it("returns a generic 503 when Clerk returns no token", async () => {
    getTokenMock.mockResolvedValue(null);

    const response = await GET();

    await expectPrivateResponse(response, 503, {
      error: "navigation_unavailable",
    });
    expect(hasHostProfileMock).not.toHaveBeenCalled();
  });

  it("sanitizes token and database failures", async () => {
    getTokenMock.mockRejectedValueOnce(
      new Error("Clerk failed with fake-secret-token"),
    );

    const tokenFailure = await GET();
    await expectPrivateResponse(tokenFailure, 503, {
      error: "navigation_unavailable",
    });

    getTokenMock.mockResolvedValue("clerk-token");
    hasHostProfileMock.mockRejectedValueOnce(
      new Error("Supabase failed with fake-database-secret"),
    );

    const databaseFailure = await GET();
    await expectPrivateResponse(databaseFailure, 503, {
      error: "navigation_unavailable",
    });
  });
});
