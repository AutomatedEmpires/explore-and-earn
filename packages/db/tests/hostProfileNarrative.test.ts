import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../src/client.js", () => ({ anonClient: vi.fn(), authedClient: vi.fn() }));

import { sanitizeHostProfileNarrative } from "../src/queries/hostProfiles.js";

describe("host profile narrative", () => {
  it("normalizes the exact fields rendered by the public profile", () => {
    expect(
      sanitizeHostProfileNarrative({
        whyWorkForUs: "  A clear season with thoughtful training.  ",
        team: [
          { name: "  Maya Chen  ", role: "  General Manager  " },
          { name: "", role: "" },
        ],
        activities: [" Trail access ", "", 42],
        perks: [" Shift meals ", "End-of-season bonus"],
        culture: [" Safety before speed ", null, "Direct feedback"],
        managementApproach: "  Weekly plans are published in advance.  ",
        typicalDay: "  Start with a stand-up, then rotate stations.  ",
        workEnvironment: "  Most shifts are outside in changing weather.  ",
        seasonRhythm: [" September — onboarding ", "October — peak weekends"],
        training: [" Two paid orientation days ", "Role shadowing"],
        transportation: [" Daily staff shuttle ", "Amtrak nearby"],
        remoteness: "  Town services are 15 minutes away.  ",
        nearbyServices: [" Grocery store ", "Urgent care"],
        housingDescription: "  Shared cabins with utilities included.  ",
        mealsDescription: "  A staff meal is provided after each shift.  ",
        faqs: [
          {
            question: "  How are days off scheduled?  ",
            answer: "  Schedules are posted ten days ahead.  ",
          },
          { question: "Missing answer", answer: "  " },
        ],
      }),
    ).toEqual({
      whyWorkForUs: "A clear season with thoughtful training.",
      team: [{ name: "Maya Chen", role: "General Manager" }],
      activities: ["Trail access"],
      perks: ["Shift meals", "End-of-season bonus"],
      culture: ["Safety before speed", "Direct feedback"],
      managementApproach: "Weekly plans are published in advance.",
      typicalDay: "Start with a stand-up, then rotate stations.",
      workEnvironment: "Most shifts are outside in changing weather.",
      seasonRhythm: ["September — onboarding", "October — peak weekends"],
      training: ["Two paid orientation days", "Role shadowing"],
      transportation: ["Daily staff shuttle", "Amtrak nearby"],
      remoteness: "Town services are 15 minutes away.",
      nearbyServices: ["Grocery store", "Urgent care"],
      housingDescription: "Shared cabins with utilities included.",
      mealsDescription: "A staff meal is provided after each shift.",
      faqs: [
        {
          question: "How are days off scheduled?",
          answer: "Schedules are posted ten days ahead.",
        },
      ],
    });
  });

  it("returns absence for empty or malformed showcase data", () => {
    expect(sanitizeHostProfileNarrative(null)).toEqual({});
    expect(
      sanitizeHostProfileNarrative(
        Object.assign([], { whyWorkForUs: "Array properties are not narrative." }),
      ),
    ).toEqual({});
    expect(
      sanitizeHostProfileNarrative({
        whyWorkForUs: "   ",
        team: [null, 7],
        activities: "not-an-array",
        perks: [],
        culture: {},
        managementApproach: 12,
        seasonRhythm: false,
        faqs: [{ question: "Question only" }, "invalid"],
      }),
    ).toEqual({});
  });

  it("bounds every repeated and long-form public input", () => {
    const result = sanitizeHostProfileNarrative({
      whyWorkForUs: "w".repeat(3_100),
      culture: Array.from({ length: 20 }, (_, index) => `${index}-${"c".repeat(240)}`),
      transportation: Array.from({ length: 20 }, (_, index) => `${index}-${"t".repeat(260)}`),
      faqs: Array.from({ length: 16 }, (_, index) => ({
        question: `${index}-${"q".repeat(300)}`,
        answer: "a".repeat(1_800),
      })),
    });

    expect(result.whyWorkForUs).toHaveLength(3_000);
    expect(result.culture).toHaveLength(16);
    expect(result.culture?.every((entry) => entry.length <= 200)).toBe(true);
    expect(result.transportation).toHaveLength(16);
    expect(result.transportation?.every((entry) => entry.length <= 240)).toBe(true);
    expect(result.faqs).toHaveLength(12);
    expect(result.faqs?.every((faq) => faq.question.length <= 240)).toBe(true);
    expect(result.faqs?.every((faq) => faq.answer.length <= 1_600)).toBe(true);
  });
});
