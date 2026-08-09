import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const authedClientMock = vi.hoisted(() => vi.fn());
vi.mock("../src/client.js", () => ({
  anonClient: vi.fn(),
  authedClient: authedClientMock,
}));

import { createHostProfile } from "../src/queries/hostProfiles.js";
import {
  getSeekerAvailability,
  getSeekerAvailabilityResult,
  getSeekerProfile,
  getSeekerProfileResult,
  getSeekerTravelPrefs,
  getSeekerTravelPrefsResult,
  saveSeekerProfile,
} from "../src/queries/seekerProfiles.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createHostProfile", () => {
  it("uses the JWT-derived creation RPC and persists all onboarding facts", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: "11111111-1111-1111-1111-111111111111",
      error: null,
    });
    const from = vi.fn();
    authedClientMock.mockReturnValue({ rpc, from });

    await expect(
      createHostProfile("token", {
        companyName: "Glacier Orchard",
        categoryScopes: ["farm", "remote"],
        primaryLocationName: "Wenatchee, Washington",
      }),
    ).resolves.toEqual({
      ok: true,
      id: "11111111-1111-1111-1111-111111111111",
    });

    expect(rpc).toHaveBeenCalledWith("create_my_host_profile", {
      p_company_name: "Glacier Orchard",
      p_category_scopes: ["farm", "remote"],
      p_primary_location_name: "Wenatchee, Washington",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("returns RPC failures without falling back to a direct table insert", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "profile_identity_disabled" },
    });
    const from = vi.fn();
    authedClientMock.mockReturnValue({ rpc, from });

    await expect(
      createHostProfile("token", {
        companyName: "Glacier Orchard",
        categoryScopes: ["farm"],
        primaryLocationName: null,
      }),
    ).resolves.toEqual({ ok: false, error: "profile_identity_disabled" });
    expect(from).not.toHaveBeenCalled();
  });
});

function seekerClient(options?: {
  ensureData?: unknown;
  ensureError?: { message: string } | null;
  savedData?: unknown;
  queryError?: { message: string } | null;
}) {
  const query = {
    update: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: options?.savedData === undefined ? { id: "seeker-1" } : options.savedData,
      error: options?.queryError ?? null,
    }),
  };
  query.update.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  query.select.mockReturnValue(query);

  const client = {
    rpc: vi.fn().mockResolvedValue({
      data:
        options?.ensureData === undefined
          ? "22222222-2222-2222-2222-222222222222"
          : options.ensureData,
      error: options?.ensureError ?? null,
    }),
    from: vi.fn().mockReturnValue(query),
  };
  authedClientMock.mockReturnValue(client);
  return { client, query };
}

describe("saveSeekerProfile", () => {
  it("ensures the caller row, then verifies the owner-scoped update affected it", async () => {
    const { client, query } = seekerClient();

    await expect(
      saveSeekerProfile("token", "user-seeker-1", {
        displayName: "River",
        relativeLocation: "Bend, Oregon",
        locationPref: "Pacific Northwest",
        travelReadiness: "ready_to_relocate",
        availabilityStart: "2026-09-01T00:00:00.000Z",
        availabilityEnd: "2026-10-15T00:00:00.000Z",
        availabilityStatus: "date_range",
        seekingTimeline: "1_month",
        remotePreference: "any",
        desiredRoles: ["Ranch hand"],
        generalSkills: ["Animal care"],
        onboardingComplete: true,
      }),
    ).resolves.toEqual({ ok: true });

    expect(client.rpc).toHaveBeenCalledWith("ensure_my_seeker_profile");
    expect(client.from).toHaveBeenCalledWith("seeker_profiles");
    expect(query.update).toHaveBeenCalledWith({
      display_name: "River",
      relative_location: "Bend, Oregon",
      location_pref: "Pacific Northwest",
      travel_readiness: "ready_to_relocate",
      availability_start: "2026-09-01T00:00:00.000Z",
      availability_end: "2026-10-15T00:00:00.000Z",
      availability_status: "date_range",
      seeking_timeline: "1_month",
      remote_preference: "any",
      desired_roles: ["Ranch hand"],
      general_skill_tags: ["Animal care"],
      onboarding_complete: true,
    });
    expect(query.eq.mock.calls).toEqual([
      ["id", "22222222-2222-2222-2222-222222222222"],
      ["clerk_user_id", "user-seeker-1"],
    ]);
    expect(query.is).toHaveBeenCalledWith("deleted_at", null);
    expect(query.select).toHaveBeenCalledWith("id");
  });

  it("does not report success when RLS or a deletion race updates zero rows", async () => {
    seekerClient({ savedData: null });

    await expect(
      saveSeekerProfile("token", "user-seeker-1", { displayName: "River" }),
    ).resolves.toEqual({
      ok: false,
      error: "seeker_profile_update_failed",
    });
  });

  it("returns ensure failures without attempting a direct profile insert", async () => {
    const { client } = seekerClient({
      ensureData: null,
      ensureError: { message: "profile_identity_disabled" },
    });

    await expect(
      saveSeekerProfile("token", "user-seeker-1", { displayName: "River" }),
    ).resolves.toEqual({ ok: false, error: "profile_identity_disabled" });
    expect(client.from).not.toHaveBeenCalled();
  });
});

describe("getSeekerProfile", () => {
  it("loads persisted role and skill tags as distinct profile fields", async () => {
    const { query } = seekerClient({
      savedData: {
        id: "seeker-1",
        display_name: "River",
        location_pref: "Pacific Northwest",
        remote_preference: "hybrid",
        desired_roles: ["Ranch hand"],
        general_skill_tags: ["Animal care"],
      },
    });

    await expect(getSeekerProfile("token", "user-seeker-1")).resolves.toEqual(
      expect.objectContaining({
        desiredRoles: ["Ranch hand"],
        generalSkills: ["Animal care"],
        locationPref: "Pacific Northwest",
        remotePreference: "hybrid",
      }),
    );
    expect(query.select).toHaveBeenCalledWith(
      expect.stringContaining("general_skill_tags"),
    );
  });

  it("distinguishes a missing profile from a failed onboarding read", async () => {
    seekerClient({ savedData: null });
    await expect(
      getSeekerProfileResult("token", "user-seeker-1"),
    ).resolves.toEqual({ ok: true, profile: null });

    seekerClient({ queryError: { message: "database unavailable" } });
    await expect(
      getSeekerProfileResult("token", "user-seeker-1"),
    ).resolves.toEqual({ ok: false, error: "database unavailable" });
  });
});

describe("strict seeker schedule and travel reads", () => {
  it("preserves confirmed missing profile settings as explicitly unset", async () => {
    seekerClient({ savedData: null });
    await expect(
      getSeekerTravelPrefsResult("token", "user-seeker-1"),
    ).resolves.toEqual({
      ok: true,
      travel: { travelReadiness: null, locationPref: "" },
    });

    seekerClient({ savedData: null });
    await expect(
      getSeekerAvailabilityResult("token", "user-seeker-1"),
    ).resolves.toEqual({
      ok: true,
      availability: {
        availabilityStart: null,
        availabilityEnd: null,
        availabilityStatus: null,
      },
    });
  });

  it("returns persisted nullable and stated settings without inventing defaults", async () => {
    const { query: travelQuery } = seekerClient({
      savedData: {
        travel_readiness: null,
        location_pref: "Pacific Northwest",
      },
    });
    await expect(
      getSeekerTravelPrefsResult("token", "user-seeker-1"),
    ).resolves.toEqual({
      ok: true,
      travel: {
        travelReadiness: null,
        locationPref: "Pacific Northwest",
      },
    });
    expect(travelQuery.select).toHaveBeenCalledWith(
      "travel_readiness, location_pref",
    );
    expect(travelQuery.eq).toHaveBeenCalledWith(
      "clerk_user_id",
      "user-seeker-1",
    );
    expect(travelQuery.is).toHaveBeenCalledWith("deleted_at", null);

    const { query: availabilityQuery } = seekerClient({
      savedData: {
        availability_start: "2026-09-01T00:00:00.000Z",
        availability_end: "2026-10-15T00:00:00.000Z",
        availability_status: "date_range",
      },
    });
    await expect(
      getSeekerAvailabilityResult("token", "user-seeker-1"),
    ).resolves.toEqual({
      ok: true,
      availability: {
        availabilityStart: "2026-09-01T00:00:00.000Z",
        availabilityEnd: "2026-10-15T00:00:00.000Z",
        availabilityStatus: "date_range",
      },
    });
    expect(availabilityQuery.select).toHaveBeenCalledWith(
      "availability_start, availability_end, availability_status",
    );
    expect(availabilityQuery.eq).toHaveBeenCalledWith(
      "clerk_user_id",
      "user-seeker-1",
    );
    expect(availabilityQuery.is).toHaveBeenCalledWith("deleted_at", null);
  });

  it("keeps query and row-shape faults distinct from confirmed unset data", async () => {
    seekerClient({ queryError: { message: "database unavailable" } });
    await expect(
      getSeekerTravelPrefsResult("token", "user-seeker-1"),
    ).resolves.toEqual({ ok: false, error: "database unavailable" });

    seekerClient({
      savedData: {
        availability_start: null,
        availability_end: null,
        availability_status: "someday",
      },
    });
    await expect(
      getSeekerAvailabilityResult("token", "user-seeker-1"),
    ).resolves.toEqual({ ok: false, error: "invalid_seeker_availability" });

    authedClientMock.mockImplementationOnce(() => {
      throw new Error("client unavailable");
    });
    await expect(
      getSeekerTravelPrefsResult("token", "user-seeker-1"),
    ).resolves.toEqual({ ok: false, error: "client unavailable" });
  });

  it("keeps compatibility loaders explicitly unset when strict reads fail", async () => {
    seekerClient({ queryError: { message: "database unavailable" } });
    await expect(
      getSeekerTravelPrefs("token", "user-seeker-1"),
    ).resolves.toEqual({ travelReadiness: null, locationPref: "" });

    seekerClient({ queryError: { message: "database unavailable" } });
    await expect(
      getSeekerAvailability("token", "user-seeker-1"),
    ).resolves.toEqual({
      availabilityStart: null,
      availabilityEnd: null,
      availabilityStatus: null,
    });
  });
});
