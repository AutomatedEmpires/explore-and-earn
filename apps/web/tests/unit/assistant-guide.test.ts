/**
 * Adversarial tests for The Guide's trust boundary.
 *
 * What these pin:
 *  - IDENTITY CLOSURE: no tool input schema exposes an identity field — the
 *    model structurally cannot choose whose data a tool reads.
 *  - CROSS-TENANT DENIAL: host screening/sourcing tools return typed errors
 *    for listings/applicants outside the authenticated host's scope, even
 *    when the model supplies well-formed foreign ids.
 *  - HONEST DEGRADATION: the /api/assistant route 401s without auth and 503s
 *    without an AI gateway key (no fake AI output, no crash).
 *
 * The model itself is never live here — tool execute() functions are called
 * directly (that is exactly what the ai SDK does) with the db layer mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// ── db layer mock (identity-scoped functions) ───────────────────────────────
const mockDb = {
  getHostApplications: vi.fn(),
  getHostListings: vi.fn(),
  getMatchScoresForHost: vi.fn(),
  getSeekerResumeByProfileId: vi.fn(),
  getMatchedSeekersForListing: vi.fn(),
  getInviteEntitlement: vi.fn(),
  getListingMatchRequirements: vi.fn(),
  getPublicListingById: vi.fn(),
  getSeekerProfile: vi.fn(),
  getSeekerResume: vi.fn(),
  getSeekerApplications: vi.fn(),
  searchListings: vi.fn(),
  getHostProfile: vi.fn(),
};

vi.mock("@explore-and-earn/db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "@explore-and-earn/db",
  );
  return {
    ...actual,
    getHostApplications: (...args: unknown[]) => mockDb.getHostApplications(...args),
    getHostListings: (...args: unknown[]) => mockDb.getHostListings(...args),
    getMatchScoresForHost: (...args: unknown[]) => mockDb.getMatchScoresForHost(...args),
    getSeekerResumeByProfileId: (...args: unknown[]) =>
      mockDb.getSeekerResumeByProfileId(...args),
    getMatchedSeekersForListing: (...args: unknown[]) =>
      mockDb.getMatchedSeekersForListing(...args),
    getInviteEntitlement: (...args: unknown[]) => mockDb.getInviteEntitlement(...args),
    getListingMatchRequirements: (...args: unknown[]) =>
      mockDb.getListingMatchRequirements(...args),
    getPublicListingById: (...args: unknown[]) => mockDb.getPublicListingById(...args),
    getSeekerProfile: (...args: unknown[]) => mockDb.getSeekerProfile(...args),
    getSeekerResume: (...args: unknown[]) => mockDb.getSeekerResume(...args),
    getSeekerApplications: (...args: unknown[]) => mockDb.getSeekerApplications(...args),
    searchListings: (...args: unknown[]) => mockDb.searchListings(...args),
    getHostProfile: (...args: unknown[]) => mockDb.getHostProfile(...args),
  };
});

import { buildSeekerTools } from "../../services/assistant/tools";
import { buildHostTools } from "../../services/assistant/hostTools";

const CTX = { token: "tok-A", userId: "user_A" };

const LEGACY_BLANK_RESUME = {
  profile: null,
  experiences: [
    {
      id: "legacy-blank",
      companyName: "   ",
      roleTitle: null,
      location: "Private legacy location",
      startDate: "2025-06-01",
      endDate: null,
      isCurrent: true,
      summary: "Private legacy summary about operating a tractor.",
      categoryTags: ["farm"],
      skillTags: ["private-legacy-skill"],
    },
  ],
  educations: [],
  certifications: [],
};

type AnyTool = {
  inputSchema?: { shape?: Record<string, unknown> };
  execute: (input: Record<string, unknown>, options?: unknown) => Promise<unknown>;
};

function toolOf(set: Record<string, unknown>, name: string): AnyTool {
  const t = set[name] as AnyTool | undefined;
  if (!t) throw new Error(`tool ${name} missing`);
  return t;
}

beforeEach(() => {
  for (const fn of Object.values(mockDb)) fn.mockReset();
});

describe("identity closure — no tool schema exposes an identity field", () => {
  const FORBIDDEN_INPUT_KEYS = [
    "userId",
    "clerkUserId",
    "seekerId",
    "hostId",
    "hostProfileId",
    "organizationId",
    "token",
    "tier",
    "role",
  ];

  it.each([
    ["seeker", () => buildSeekerTools(CTX)],
    ["host", () => buildHostTools(CTX)],
  ])("%s tool inputs expose business fields only", (_side, build) => {
    const tools = build() as Record<string, AnyTool>;
    expect(Object.keys(tools).length).toBeGreaterThan(0);
    for (const [name, t] of Object.entries(tools)) {
      const shape = t.inputSchema?.shape ?? {};
      for (const key of Object.keys(shape)) {
        expect(
          FORBIDDEN_INPUT_KEYS.includes(key),
          `${name} exposes identity-ish input '${key}'`,
        ).toBe(false);
      }
    }
  });

  // seekerProfileId on screen_applicant is a BUSINESS input (which applicant),
  // not an identity: the tool must intersect it against the host's own
  // applications, proven below.
});

describe("host screening — cross-tenant denial", () => {
  it("screen_applicant refuses an applicant who never applied to this host", async () => {
    mockDb.getHostApplications.mockResolvedValue([
      { listingId: "listing-own", seekerProfileId: "seeker-own", status: "applied", coverMessage: null },
    ]);
    const tools = buildHostTools(CTX);
    const result = await toolOf(tools as never, "screen_applicant").execute({
      listingId: "listing-foreign",
      seekerProfileId: "seeker-foreign",
    });
    expect(result).toEqual({ error: "applicant_not_found" });
    // The resume gate was never even consulted.
    expect(mockDb.getSeekerResumeByProfileId).not.toHaveBeenCalled();
  });

  it("screen_applicant returns resume_unavailable when the hostCanViewSeeker gate denies", async () => {
    mockDb.getHostApplications.mockResolvedValue([
      { listingId: "listing-own", seekerProfileId: "seeker-own", status: "applied", coverMessage: null },
    ]);
    mockDb.getSeekerResumeByProfileId.mockResolvedValue(null); // gate said no
    mockDb.getListingMatchRequirements.mockResolvedValue(null);
    mockDb.getMatchScoresForHost.mockResolvedValue(new Map());

    const tools = buildHostTools(CTX);
    const result = await toolOf(tools as never, "screen_applicant").execute({
      listingId: "listing-own",
      seekerProfileId: "seeker-own",
    });
    expect(result).toEqual({ error: "resume_unavailable" });
  });

  it("screen_applicant always queries with the CLOSED-OVER identity, never model input", async () => {
    mockDb.getHostApplications.mockResolvedValue([]);
    const tools = buildHostTools(CTX);
    await toolOf(tools as never, "screen_applicant").execute({
      listingId: "x",
      seekerProfileId: "y",
    });
    expect(mockDb.getHostApplications).toHaveBeenCalledWith("tok-A", "user_A");
  });

  it("screen_applicant never exposes an experience with no identity", async () => {
    mockDb.getHostApplications.mockResolvedValue([
      {
        listingId: "listing-own",
        seekerProfileId: "seeker-own",
        status: "applied",
        coverMessage: null,
      },
    ]);
    mockDb.getSeekerResumeByProfileId.mockResolvedValue(LEGACY_BLANK_RESUME);
    mockDb.getListingMatchRequirements.mockResolvedValue(null);
    mockDb.getMatchScoresForHost.mockResolvedValue(new Map());

    const tools = buildHostTools(CTX);
    const result = (await toolOf(tools as never, "screen_applicant").execute({
      listingId: "listing-own",
      seekerProfileId: "seeker-own",
    })) as {
      resume: { experiences: unknown[] };
      missingInformation: string[];
      interviewTopics: string[];
    };

    expect(result.resume.experiences).toEqual([]);
    expect(result.missingInformation).toEqual(
      expect.arrayContaining(["no_experience", "no_skills"]),
    );
    expect(result.interviewTopics).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("Private legacy");
    expect(JSON.stringify(result)).not.toContain("private-legacy-skill");
  });

  it("matched_seekers surfaces listing_not_found for a foreign listing", async () => {
    mockDb.getMatchedSeekersForListing.mockResolvedValue(null); // ownership check inside
    mockDb.getInviteEntitlement.mockResolvedValue(null);
    const tools = buildHostTools(CTX);
    const result = await toolOf(tools as never, "matched_seekers").execute({
      listingId: "listing-foreign",
    });
    expect(result).toEqual({ error: "listing_not_found" });
    expect(mockDb.getMatchedSeekersForListing).toHaveBeenCalledWith(
      "tok-A",
      "user_A",
      "listing-foreign",
      10,
    );
  });
});

describe("seeker tools — grounded errors, no fabrication", () => {
  it("explain_match reports listing_not_found instead of inventing a listing", async () => {
    mockDb.getPublicListingById.mockResolvedValue(null);
    mockDb.getSeekerProfile.mockResolvedValue(null);
    const tools = buildSeekerTools(CTX);
    const result = await toolOf(tools as never, "explain_match").execute({
      listingId: "nope",
    });
    expect(result).toEqual({ error: "listing_not_found" });
  });

  it("prepare_application requires a real profile before evaluating fit", async () => {
    mockDb.getPublicListingById.mockResolvedValue({
      id: "l1",
      title: "Farmhand",
      category: "farm",
      status: "live",
      housing_included: true,
      housing_description: null,
      meals_included: true,
      meals_description: null,
      compensation_min_cents: null,
      compensation_max_cents: null,
      compensation_summary: null,
      begins_at: null,
      ends_at: null,
      location_display: "Sonoma",
      visa_support: false,
    });
    mockDb.getSeekerProfile.mockResolvedValue(null);
    const tools = buildSeekerTools(CTX);
    const result = await toolOf(tools as never, "prepare_application").execute({
      listingId: "l1",
    });
    expect(result).toEqual({ error: "profile_incomplete" });
  });

  it("resume_insights marks output review-only and never claims persistence", async () => {
    mockDb.getSeekerResume.mockResolvedValue({
      profile: null,
      experiences: [],
      educations: [],
      certifications: [],
    });
    const tools = buildSeekerTools(CTX);
    const result = (await toolOf(tools as never, "resume_insights").execute({})) as {
      reviewRequired: boolean;
      skills: unknown[];
    };
    expect(result.reviewRequired).toBe(true);
    expect(result.skills).toEqual([]); // empty resume → zero invented skills
  });

  it("resume_summary omits metadata-only legacy experience rows", async () => {
    mockDb.getSeekerResume.mockResolvedValue(LEGACY_BLANK_RESUME);

    const tools = buildSeekerTools(CTX);
    const result = (await toolOf(tools as never, "resume_summary").execute({})) as {
      experienceCount: number;
      experiences: unknown[];
      gaps: string[];
    };

    expect(result.experienceCount).toBe(0);
    expect(result.experiences).toEqual([]);
    expect(result.gaps).toContain("at least one work experience with a concrete summary");
    expect(JSON.stringify(result)).not.toContain("Private legacy");
    expect(JSON.stringify(result)).not.toContain("private-legacy-skill");
  });

  it("resume_insights drops invalid-row skills and their evidence", async () => {
    mockDb.getSeekerResume.mockResolvedValue(LEGACY_BLANK_RESUME);

    const tools = buildSeekerTools(CTX);
    const result = (await toolOf(tools as never, "resume_insights").execute({})) as {
      counts: { experiences: number };
      skills: Array<{ evidence: unknown[] }>;
      gaps: Array<{ code: string }>;
    };

    expect(result.counts.experiences).toBe(0);
    expect(result.skills).toEqual([]);
    expect(result.gaps.map((gap) => gap.code)).toEqual(
      expect.arrayContaining(["no_experience", "no_skills"]),
    );
    expect(result.skills.flatMap((skill) => skill.evidence)).toEqual([]);
  });
});

describe("/api/assistant — honest degradation", () => {
  it("401s without an authenticated user", async () => {
    vi.resetModules();
    vi.doMock("@clerk/nextjs/server", () => ({
      auth: async () => ({ userId: null, getToken: async () => null }),
    }));
    const { POST } = await import("../../app/api/assistant/route");
    const res = await POST(
      new Request("http://localhost/api/assistant", {
        method: "POST",
        body: JSON.stringify({ messages: [{ role: "user", parts: [] }] }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("503s (no fake AI output) when the gateway key is missing", async () => {
    vi.resetModules();
    vi.doMock("@clerk/nextjs/server", () => ({
      auth: async () => ({ userId: "user_A", getToken: async () => "tok" }),
    }));
    const prior = process.env.AI_GATEWAY_API_KEY;
    delete process.env.AI_GATEWAY_API_KEY;
    try {
      const { POST } = await import("../../app/api/assistant/route");
      const res = await POST(
        new Request("http://localhost/api/assistant", {
          method: "POST",
          body: JSON.stringify({ messages: [{ role: "user", parts: [] }] }),
        }),
      );
      expect(res.status).toBe(503);
      expect(await res.text()).toContain("not configured");
    } finally {
      if (prior !== undefined) process.env.AI_GATEWAY_API_KEY = prior;
    }
  });
});
