/**
 * Unit tests for the résumé intelligence engine
 * (packages/db/src/lib/resumeInsights.ts).
 *
 * Pins the no-fabrication contract: skills carry provenance to real rows,
 * inference is transparent lexicon matching over text the seeker actually
 * wrote (with excerpts), missing data surfaces as gaps (never filled in),
 * conflicts are detected not silently fixed, and listing preparation reports
 * missing requirements honestly.
 */
import { describe, expect, it } from "vitest";

import { analyzeResume, prepareForListing } from "../src/lib/resumeInsights";
import type { SeekerResume } from "../src/queries/seekerResume";

const NOW = Date.parse("2026-07-01T00:00:00Z");

const emptyResume: SeekerResume = {
  profile: null,
  experiences: [],
  educations: [],
  certifications: [],
};

const richResume: SeekerResume = {
  profile: {
    seekerProfileId: "sp-1",
    bio: "Hard-working traveler who loves the outdoors.",
    headline: null,
    displayName: "Alex Rivers",
    location: "Bozeman, MT",
    seekingTimeline: "now",
    desiredCategories: ["farm", "seasonal"],
    generalSkills: ["harvesting"],
  },
  experiences: [
    {
      id: "exp-1",
      companyName: "Sunrise Orchards",
      roleTitle: "Farmhand",
      location: "Hood River, OR",
      startDate: "2025-06-01",
      endDate: "2025-09-30",
      isCurrent: false,
      summary:
        "Led the apple harvest crew, operated the tractor daily, and managed irrigation lines for 40 acres.",
      categoryTags: ["farm"],
      skillTags: ["harvesting"],
    },
    {
      id: "exp-2",
      companyName: "Lakeside Lodge",
      roleTitle: "Server",
      location: null,
      startDate: "2024-11-01",
      endDate: "2025-03-15",
      isCurrent: false,
      summary: null,
      categoryTags: ["seasonal"],
      skillTags: [],
    },
  ],
  educations: [],
  certifications: [
    {
      id: "cert-1",
      name: "Wilderness First Responder",
      issuingOrganization: "NOLS",
      issuedAt: "2024-05-01",
      expiresAt: "2026-05-01", // expired relative to NOW
      doesNotExpire: false,
      description: null,
      credentialUrl: null,
      categoryTags: [],
      skillTags: ["first aid"],
    },
  ],
};

describe("analyzeResume — skills with provenance", () => {
  it("parsed skills come from real skill tags with row-level evidence", () => {
    const insights = analyzeResume(richResume, NOW);
    const harvesting = insights.skills.find((s) => s.skill === "harvesting");
    expect(harvesting).toBeDefined();
    expect(harvesting?.kind).toBe("parsed");
    expect(harvesting?.confidence).toBe("high");
    expect(harvesting?.onProfile).toBe(true);
    expect(harvesting?.evidence.some((e) => e.source === "experience" && e.sourceId === "exp-1")).toBe(true);
  });

  it("inferred skills come from the seeker's own summary text with an excerpt", () => {
    const insights = analyzeResume(richResume, NOW);
    const tractor = insights.skills.find((s) => s.skill === "tractor operation");
    expect(tractor).toBeDefined();
    expect(tractor?.kind).toBe("inferred");
    expect(tractor?.onProfile).toBe(false);
    const evidence = tractor?.evidence[0];
    expect(evidence?.source).toBe("experience");
    expect(evidence?.sourceId).toBe("exp-1");
    expect(evidence?.field).toBe("summary");
    expect(evidence?.excerpt).toContain("tractor");
  });

  it("never invents skills for an empty resume", () => {
    const insights = analyzeResume(emptyResume, NOW);
    expect(insights.skills).toEqual([]);
    expect(insights.completeness).toBe(0);
  });

  it("ignores metadata and tags on an experience with no identity", () => {
    const resume: SeekerResume = {
      ...emptyResume,
      experiences: [
        {
          id: "legacy-blank",
          companyName: "   ",
          roleTitle: null,
          location: "Bozeman, MT",
          startDate: "2025-06-01",
          endDate: null,
          isCurrent: true,
          summary: null,
          categoryTags: ["farm"],
          skillTags: ["harvesting"],
        },
      ],
    };

    const insights = analyzeResume(resume, NOW);

    expect(insights.counts.experiences).toBe(0);
    expect(insights.skills).toEqual([]);
    expect(insights.gaps.map((gap) => gap.code)).toEqual(
      expect.arrayContaining(["no_experience", "no_skills"]),
    );
    expect(insights.suggestions.flatMap((suggestion) => suggestion.evidence)).toEqual([]);
  });

  it("lexicon matching is whole-word (no substring false positives)", () => {
    const resume: SeekerResume = {
      ...emptyResume,
      experiences: [
        {
          id: "exp-x",
          companyName: "Acme",
          roleTitle: "Clerk",
          location: null,
          startDate: null,
          endDate: null,
          isCurrent: false,
          // "cooked the books" contains 'cook' as a word → legitimately matches;
          // "scooter" must NOT match 'cook'.
          summary: "Rode a scooter to work.",
          categoryTags: [],
          skillTags: [],
        },
      ],
    };
    const insights = analyzeResume(resume, NOW);
    expect(insights.skills.find((s) => s.skill === "cooking")).toBeUndefined();
  });
});

describe("analyzeResume — gaps and conflicts", () => {
  it("reports missing data as gaps, never fills it in", () => {
    const insights = analyzeResume(emptyResume, NOW);
    const codes = insights.gaps.map((g) => g.code);
    expect(codes).toContain("missing_bio");
    expect(codes).toContain("no_experience");
    expect(codes).toContain("no_skills");
    expect(codes).toContain("missing_desired_categories");
  });

  it("flags a summary-less experience by row id", () => {
    const insights = analyzeResume(richResume, NOW);
    expect(insights.gaps).toContainEqual({
      code: "experience_without_summary",
      sourceId: "exp-2",
    });
  });

  it("detects inverted dates, duplicates, and expired certifications", () => {
    const conflicted: SeekerResume = {
      ...richResume,
      experiences: [
        ...richResume.experiences,
        {
          id: "exp-3",
          companyName: "sunrise orchards",
          roleTitle: "farmhand", // duplicate of exp-1 (case-insensitive)
          location: null,
          startDate: "2025-09-01",
          endDate: "2025-08-01", // inverted
          isCurrent: false,
          summary: "x",
          categoryTags: [],
          skillTags: [],
        },
      ],
    };
    const insights = analyzeResume(conflicted, NOW);
    const codes = insights.conflicts.map((c) => c.code);
    expect(codes).toContain("experience_dates_inverted");
    expect(codes).toContain("duplicate_experience");
    expect(codes).toContain("certification_expired");
    const expired = insights.conflicts.find((c) => c.code === "certification_expired");
    expect(expired?.detail).toBe("Wilderness First Responder");
  });
});

describe("analyzeResume — suggestions are review-only proposals", () => {
  it("proposes adding evidenced skills that are not on the profile", () => {
    const insights = analyzeResume(richResume, NOW);
    const proposal = insights.suggestions.find(
      (s) => s.kind === "add_general_skill" && s.value === "tractor operation",
    );
    expect(proposal).toBeDefined();
    expect(proposal?.evidence.length).toBeGreaterThan(0);
    // A skill already on the profile is never re-proposed.
    expect(
      insights.suggestions.find(
        (s) => s.kind === "add_general_skill" && s.value === "harvesting",
      ),
    ).toBeUndefined();
  });

  it("is deterministic", () => {
    expect(analyzeResume(richResume, NOW)).toEqual(analyzeResume(richResume, NOW));
  });
});

describe("prepareForListing — honest requirement coverage", () => {
  it("splits covered vs missing without inventing qualifications", () => {
    const insights = analyzeResume(richResume, NOW);
    const prep = prepareForListing(
      insights,
      {
        requiredSkillTags: ["harvesting", "welding"],
        requiredCertifications: ["Wilderness First Responder", "CDL"],
      },
      richResume.certifications,
    );
    expect(prep.coveredSkills.map((s) => s.skill)).toEqual(["harvesting"]);
    expect(prep.missingSkills).toEqual(["welding"]);
    expect(prep.coveredCertifications).toEqual(["Wilderness First Responder"]);
    expect(prep.missingCertifications).toEqual(["CDL"]);
  });

  it("empty requirements → nothing covered, nothing missing", () => {
    const insights = analyzeResume(richResume, NOW);
    const prep = prepareForListing(insights, {}, richResume.certifications);
    expect(prep.coveredSkills).toEqual([]);
    expect(prep.missingSkills).toEqual([]);
  });
});
