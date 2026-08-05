import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  canCompleteInterview,
  canHostProposeInterview,
  canRecordInterviewNoShow,
  showsSelectedInterviewTime,
} from "../../components/scheduling/model";

const NOW = Date.parse("2026-08-05T18:00:00.000Z");
const CARD_SOURCE = readFileSync(
  new URL(
    "../../components/scheduling/InterviewScheduleCard.tsx",
    import.meta.url,
  ),
  "utf8",
);
const HOST_SCHEDULER_SOURCE = readFileSync(
  new URL(
    "../../components/scheduling/HostInterviewScheduler.tsx",
    import.meta.url,
  ),
  "utf8",
);
const INTERVIEW_MESSAGES = (
  JSON.parse(
    readFileSync(new URL("../../messages/en.json", import.meta.url), "utf8"),
  ) as {
    InterviewScheduling: {
      noShowHelp: string;
      proposedTimes: string;
    };
  }
).InterviewScheduling;

describe("host interview proposal availability", () => {
  it("allows a first proposal only in pre-offer application stages", () => {
    expect(canHostProposeInterview("reviewing", null, NOW)).toBe(true);
    expect(canHostProposeInterview("offered", null, NOW)).toBe(false);
    expect(canHostProposeInterview("withdrawn", null, NOW)).toBe(false);
  });

  it("keeps a live proposal and confirmed interview single-active", () => {
    expect(
      canHostProposeInterview(
        "reviewing",
        { status: "proposed", expiresAt: "2026-08-06T18:00:00.000Z" },
        NOW,
      ),
    ).toBe(false);
    expect(
      canHostProposeInterview(
        "reviewing",
        { status: "selected", expiresAt: "2026-08-05T17:00:00.000Z" },
        NOW,
      ),
    ).toBe(false);
  });

  it("allows re-proposal after alternatives or a clock-expired proposal", () => {
    expect(
      canHostProposeInterview(
        "reviewing",
        { status: "alternate_requested", expiresAt: "2026-08-06T18:00:00.000Z" },
        NOW,
      ),
    ).toBe(true);
    expect(
      canHostProposeInterview(
        "reviewing",
        { status: "proposed", expiresAt: "2026-08-05T17:00:00.000Z" },
        NOW,
      ),
    ).toBe(true);
  });
});

describe("interview state visibility and action timing", () => {
  it.each(["selected", "completed", "no_show", "cancelled", "expired"] as const)(
    "keeps the chosen time visible for %s audit state",
    (status) => {
      expect(showsSelectedInterviewTime(status)).toBe(true);
    },
  );

  it.each(["proposed", "alternate_requested"] as const)(
    "does not claim a chosen time for %s",
    (status) => {
      expect(showsSelectedInterviewTime(status)).toBe(false);
    },
  );

  it("waits fifteen minutes after start before permitting a no-show", () => {
    const start = "2026-08-05T18:00:00.000Z";
    expect(canRecordInterviewNoShow(start, Date.parse("2026-08-05T18:14:59.999Z"))).toBe(false);
    expect(canRecordInterviewNoShow(start, Date.parse("2026-08-05T18:15:00.000Z"))).toBe(true);
  });

  it("permits completion only once the scheduled end is reached", () => {
    const end = "2026-08-05T18:30:00.000Z";
    expect(canCompleteInterview(end, Date.parse("2026-08-05T18:29:59.999Z"))).toBe(false);
    expect(canCompleteInterview(end, Date.parse(end))).toBe(true);
  });

  it("makes timing gates and each proposed choice distinguishable without pointer hover", () => {
    expect(INTERVIEW_MESSAGES.noShowHelp).toBe(
      "No show can be recorded 15 minutes after the interview starts.",
    );
    expect(INTERVIEW_MESSAGES.proposedTimes).toBe("Proposed interview times");
    expect(CARD_SOURCE).toContain('t("noShowHelp")');
    expect(CARD_SOURCE).toContain("aria-describedby");
    expect(CARD_SOURCE).toContain('aria-label={t("chooseTime"');
    expect(CARD_SOURCE).toContain('aria-label={t("proposedTimes")}');
  });

  it("turns rejected scheduling action promises into the localized unknown error", () => {
    for (const source of [CARD_SOURCE, HOST_SCHEDULER_SOURCE]) {
      expect(source).toMatch(
        /catch\s*\{\s*setError\(t\("errors\.unknown"\)\);\s*\}\s*finally/,
      );
    }
  });
});
