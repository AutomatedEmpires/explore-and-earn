import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SEEKER_AVAILABILITY_STATUS,
  SEEKER_TRAVEL_READINESS,
} from "@explore-and-earn/contracts";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const reportErrorMock = vi.hoisted(() => vi.fn());
const queueRecomputeMock = vi.hoisted(() => vi.fn());
const dbMocks = vi.hoisted(() => ({
  saveSeekerProfile: vi.fn(),
  updateNotificationPrefs: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@explore-and-earn/db", () => dbMocks);
vi.mock("../../lib/matchRecompute", () => ({
  queueSeekerMatchRecompute: queueRecomputeMock,
}));
vi.mock("../../lib/sentry", () => ({ reportError: reportErrorMock }));

import {
  updateScheduleAction,
  updateTravelAction,
} from "../../app/actions/seekerSettings";

function authAs(userId: string | null, token: string | null = "session-token") {
  const getToken = vi.fn().mockResolvedValue(token);
  authMock.mockResolvedValue({ userId, getToken });
  return getToken;
}

function scheduleForm(
  start = "",
  end = "",
  status = "",
): FormData {
  const formData = new FormData();
  formData.set("availability_start", start);
  formData.set("availability_end", end);
  formData.set("availability_status", status);
  return formData;
}

function travelForm(readiness = "", location = ""): FormData {
  const formData = new FormData();
  formData.set("travel_readiness", readiness);
  formData.set("location_pref", location);
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  authAs("user-seeker");
  dbMocks.saveSeekerProfile.mockResolvedValue({ ok: true });
});

describe("canonical seeker settings contracts", () => {
  it("pins the schema-backed availability and travel choices", () => {
    expect(SEEKER_AVAILABILITY_STATUS).toEqual([
      "available_now",
      "date_range",
      "flexible",
      "unavailable",
    ]);
    expect(SEEKER_TRAVEL_READINESS).toEqual([
      "local_only",
      "willing_to_travel",
      "ready_to_relocate",
      "remote_only",
      "flexible",
    ]);
  });
});

describe("updateScheduleAction", () => {
  it("validates a real date range before persisting through saveSeekerProfile", async () => {
    await expect(
      updateScheduleAction(
        scheduleForm("2028-02-29", "2028-03-31", "date_range"),
      ),
    ).resolves.toEqual({ ok: true });

    expect(dbMocks.saveSeekerProfile).toHaveBeenCalledWith(
      "session-token",
      "user-seeker",
      {
        availabilityStart: "2028-02-29T00:00:00.000Z",
        availabilityEnd: "2028-03-31T00:00:00.000Z",
        availabilityStatus: "date_range",
      },
    );
    expect(revalidatePathMock.mock.calls).toEqual([
      ["/schedule"],
      ["/home"],
    ]);
    expect(queueRecomputeMock).toHaveBeenCalledWith("user-seeker");
  });

  it("maps explicit empty fields to null instead of fabricating a status", async () => {
    await expect(updateScheduleAction(scheduleForm())).resolves.toEqual({
      ok: true,
    });

    expect(dbMocks.saveSeekerProfile).toHaveBeenCalledWith(
      "session-token",
      "user-seeker",
      {
        availabilityStart: null,
        availabilityEnd: null,
        availabilityStatus: null,
      },
    );
  });

  it.each([
    "2027-02-29",
    "2028-04-31",
    "2028-2-01",
    "0000-01-01",
    "not-a-date",
  ])("rejects the non-calendar date %s before auth or I/O", async (start) => {
    await expect(
      updateScheduleAction(scheduleForm(start, "", "available_now")),
    ).resolves.toEqual({ ok: false, error: "validation" });

    expect(authMock).not.toHaveBeenCalled();
    expect(dbMocks.saveSeekerProfile).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(queueRecomputeMock).not.toHaveBeenCalled();
  });

  it("rejects an inverted date range before auth or I/O", async () => {
    await expect(
      updateScheduleAction(
        scheduleForm("2028-04-01", "2028-03-31", "date_range"),
      ),
    ).resolves.toEqual({ ok: false, error: "validation" });

    expect(authMock).not.toHaveBeenCalled();
    expect(dbMocks.saveSeekerProfile).not.toHaveBeenCalled();
  });

  it.each([
    ["2028-03-01", "", "2028-03-01T00:00:00.000Z", null],
    ["", "2028-03-31", null, "2028-03-31T00:00:00.000Z"],
  ])(
    "preserves the matching engine's open-ended date ranges (%s to %s)",
    async (start, end, expectedStart, expectedEnd) => {
      await expect(
        updateScheduleAction(scheduleForm(start, end, "date_range")),
      ).resolves.toEqual({ ok: true });

      expect(dbMocks.saveSeekerProfile).toHaveBeenCalledWith(
        "session-token",
        "user-seeker",
        {
          availabilityStart: expectedStart,
          availabilityEnd: expectedEnd,
          availabilityStatus: "date_range",
        },
      );
    },
  );

  it.each(["", "available_now", "flexible", "unavailable"])(
    "rejects dates unless status is date_range (%s)",
    async (status) => {
      await expect(
        updateScheduleAction(scheduleForm("2028-03-01", "", status)),
      ).resolves.toEqual({ ok: false, error: "validation" });

      expect(authMock).not.toHaveBeenCalled();
      expect(dbMocks.saveSeekerProfile).not.toHaveBeenCalled();
      expect(revalidatePathMock).not.toHaveBeenCalled();
      expect(queueRecomputeMock).not.toHaveBeenCalled();
    },
  );

  it("rejects an unknown status and duplicate fields before auth or I/O", async () => {
    await expect(
      updateScheduleAction(scheduleForm("", "", "sometimes")),
    ).resolves.toEqual({ ok: false, error: "validation" });

    const duplicate = scheduleForm("", "", "flexible");
    duplicate.append("availability_status", "unavailable");
    await expect(updateScheduleAction(duplicate)).resolves.toEqual({
      ok: false,
      error: "validation",
    });

    expect(authMock).not.toHaveBeenCalled();
    expect(dbMocks.saveSeekerProfile).not.toHaveBeenCalled();
  });
});

describe("updateTravelAction", () => {
  it("trims and persists travel preferences through saveSeekerProfile", async () => {
    await expect(
      updateTravelAction(
        travelForm("willing_to_travel", "  Pacific Northwest  "),
      ),
    ).resolves.toEqual({ ok: true });

    expect(dbMocks.saveSeekerProfile).toHaveBeenCalledWith(
      "session-token",
      "user-seeker",
      {
        travelReadiness: "willing_to_travel",
        locationPref: "Pacific Northwest",
      },
    );
    expect(revalidatePathMock.mock.calls).toEqual([["/travel"], ["/home"]]);
    expect(queueRecomputeMock).toHaveBeenCalledWith("user-seeker");
  });

  it("maps empty readiness and location fields to explicit null", async () => {
    await expect(updateTravelAction(travelForm())).resolves.toEqual({ ok: true });

    expect(dbMocks.saveSeekerProfile).toHaveBeenCalledWith(
      "session-token",
      "user-seeker",
      { travelReadiness: null, locationPref: null },
    );
  });

  it("rejects an unknown readiness before auth or I/O", async () => {
    await expect(
      updateTravelAction(travelForm("cross_planet", "Mars")),
    ).resolves.toEqual({ ok: false, error: "validation" });

    expect(authMock).not.toHaveBeenCalled();
    expect(dbMocks.saveSeekerProfile).not.toHaveBeenCalled();
  });
});

describe("seeker settings auth and persistence truth", () => {
  it.each([null, ""])(
    "returns unauthenticated for a missing session value without writing (%s)",
    async (missing) => {
      if (missing === null) authAs(null);
      else authAs("user-seeker", null);

      await expect(updateTravelAction(travelForm("flexible"))).resolves.toEqual({
        ok: false,
        error: "unauthenticated",
      });
      expect(dbMocks.saveSeekerProfile).not.toHaveBeenCalled();
    },
  );

  it("conceals authentication faults behind temporarily_unavailable", async () => {
    authMock.mockRejectedValueOnce(new Error("raw Clerk detail"));

    await expect(
      updateScheduleAction(scheduleForm("", "", "flexible")),
    ).resolves.toEqual({ ok: false, error: "temporarily_unavailable" });

    expect(dbMocks.saveSeekerProfile).not.toHaveBeenCalled();
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      { action: "updateScheduleAction.authenticate" },
    );
  });

  it("conceals returned and thrown persistence details without post-save work", async () => {
    dbMocks.saveSeekerProfile.mockResolvedValueOnce({
      ok: false,
      error: "raw PostgREST policy detail",
    });

    await expect(updateTravelAction(travelForm("flexible"))).resolves.toEqual({
      ok: false,
      error: "temporarily_unavailable",
    });

    dbMocks.saveSeekerProfile.mockRejectedValueOnce(
      new Error("raw network detail"),
    );
    await expect(
      updateScheduleAction(scheduleForm("", "", "flexible")),
    ).resolves.toEqual({ ok: false, error: "temporarily_unavailable" });

    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(queueRecomputeMock).not.toHaveBeenCalled();
    expect(reportErrorMock).toHaveBeenCalledTimes(2);
  });

  it("keeps durable success when revalidation, recompute, and reporting fail", async () => {
    revalidatePathMock
      .mockImplementationOnce(() => {
        throw new Error("schedule cache unavailable");
      })
      .mockImplementationOnce(() => undefined);
    reportErrorMock.mockImplementation(() => {
      throw new Error("telemetry unavailable");
    });
    queueRecomputeMock.mockImplementationOnce(() => {
      throw new Error("after registration unavailable");
    });

    await expect(
      updateScheduleAction(scheduleForm("", "", "available_now")),
    ).resolves.toEqual({ ok: true });

    expect(dbMocks.saveSeekerProfile).toHaveBeenCalledOnce();
    expect(revalidatePathMock.mock.calls).toEqual([
      ["/schedule"],
      ["/home"],
    ]);
    expect(queueRecomputeMock).toHaveBeenCalledWith("user-seeker");
  });
});
