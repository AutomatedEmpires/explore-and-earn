import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockDb = {
  getSeekerResume: vi.fn(),
  getSeekerProfile: vi.fn(),
  getSavedListingIds: vi.fn(),
  getSeekerApplicationsRich: vi.fn(),
  getSeekerInvites: vi.fn(),
};

vi.mock("@explore-and-earn/db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "@explore-and-earn/db",
  );
  return {
    ...actual,
    getSeekerResume: (...args: unknown[]) => mockDb.getSeekerResume(...args),
    getSeekerProfile: (...args: unknown[]) => mockDb.getSeekerProfile(...args),
    getSavedListingIds: (...args: unknown[]) => mockDb.getSavedListingIds(...args),
    getSeekerApplicationsRich: (...args: unknown[]) =>
      mockDb.getSeekerApplicationsRich(...args),
    getSeekerInvites: (...args: unknown[]) => mockDb.getSeekerInvites(...args),
  };
});

vi.mock("../../lib/devBench", () => ({
  isDevBenchEnabled: () => false,
}));

import { gatherSeekerBadgeStats } from "../../lib/seekerBadges";

beforeEach(() => {
  for (const fn of Object.values(mockDb)) fn.mockReset();
  mockDb.getSeekerProfile.mockResolvedValue(null);
  mockDb.getSavedListingIds.mockResolvedValue([]);
  mockDb.getSeekerApplicationsRich.mockResolvedValue([]);
  mockDb.getSeekerInvites.mockResolvedValue([]);
});

describe("seeker badge resume stats", () => {
  it("does not award experience progress for a metadata-only legacy row", async () => {
    mockDb.getSeekerResume.mockResolvedValue({
      profile: null,
      experiences: [
        {
          id: "legacy-blank",
          companyName: null,
          roleTitle: "   ",
          location: "Bozeman, MT",
          startDate: "2025-06-01",
          endDate: null,
          isCurrent: true,
          summary: null,
          categoryTags: ["farm"],
          skillTags: ["harvesting"],
        },
      ],
      educations: [],
      certifications: [],
    });

    const stats = await gatherSeekerBadgeStats("token", "user-id");

    expect(stats.experiencesCount).toBe(0);
    expect(stats.skillsCount).toBe(0);
    expect(stats.resumeCompletion).toBe(0);
  });
});
