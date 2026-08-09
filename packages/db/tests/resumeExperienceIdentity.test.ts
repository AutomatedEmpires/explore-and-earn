import { beforeEach, describe, expect, it, vi } from "vitest";

const authedClientMock = vi.hoisted(() => vi.fn());

vi.mock("../src/client.js", () => ({
  authedClient: authedClientMock,
}));

import {
  hasResumeExperienceIdentity,
  RESUME_EXPERIENCE_IDENTITY_REQUIRED,
  RESUME_EXPERIENCE_IDENTITY_REQUIRED_MESSAGE,
} from "@explore-and-earn/contracts";

import { seekerResumeCompletion } from "../src/lib/resumeCompleteness";
import {
  addResumeExperience,
  updateResumeExperience,
  type SeekerResume,
  type SeekerResumeExperience,
} from "../src/queries/seekerResume";

const BASE_EXPERIENCE: SeekerResumeExperience = {
  id: "experience-1",
  companyName: null,
  roleTitle: null,
  location: null,
  startDate: null,
  endDate: null,
  isCurrent: false,
  summary: null,
  categoryTags: [],
  skillTags: ["Harvesting"],
};

const ECMASCRIPT_TRIM_WHITESPACE =
  "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680" +
  "\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a" +
  "\u2028\u2029\u202f\u205f\u3000\ufeff";

function resumeWith(experience: SeekerResumeExperience): SeekerResume {
  return {
    profile: {
      seekerProfileId: "seeker-1",
      bio: null,
      headline: null,
      displayName: "Casey Trail",
      location: "Bend, Oregon",
      seekingTimeline: "now",
      desiredCategories: [],
      generalSkills: [],
    },
    experiences: [experience],
    educations: [],
    certifications: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resume experience identity contract", () => {
  it.each([
    ["missing", {}, false],
    ["null", { roleTitle: null, companyName: null }, false],
    ["empty", { roleTitle: "", companyName: "" }, false],
    ["whitespace", { roleTitle: "  ", companyName: "\t" }, false],
    [
      "full ECMAScript trim whitespace",
      { roleTitle: ECMASCRIPT_TRIM_WHITESPACE, companyName: null },
      false,
    ],
    ["role only", { roleTitle: " Guide ", companyName: null }, true],
    ["employer only", { roleTitle: null, companyName: " Orchard " }, true],
    [
      "Unicode-wrapped role",
      {
        roleTitle: `\ufeffGuide\u3000`,
        companyName: ECMASCRIPT_TRIM_WHITESPACE,
      },
      true,
    ],
    ["both", { roleTitle: "Guide", companyName: "Orchard" }, true],
  ])("classifies %s identity", (_label, identity, expected) => {
    expect(hasResumeExperienceIdentity(identity)).toBe(expected);
  });

  it("exports the stable code and exact shared copy", () => {
    expect(RESUME_EXPERIENCE_IDENTITY_REQUIRED).toBe(
      "experience_identity_required",
    );
    expect(RESUME_EXPERIENCE_IDENTITY_REQUIRED_MESSAGE).toBe(
      "Add a role title or the employer or place where you worked.",
    );
  });
});

describe("resume completeness ignores identity-less rows", () => {
  it("does not count a metadata-only row or its skill tags", () => {
    const status = seekerResumeCompletion(
      resumeWith({
        ...BASE_EXPERIENCE,
        location: "Hood River, Oregon",
        startDate: "2026-05-01",
        summary: "Helped with the harvest.",
        categoryTags: ["farm"],
      }),
    );

    expect(status.complete).toBe(false);
    expect(status.missing).toEqual(["skills", "bioOrExperience"]);
  });

  it("does not count an ECMAScript-whitespace-only identity", () => {
    const status = seekerResumeCompletion(
      resumeWith({
        ...BASE_EXPERIENCE,
        roleTitle: ECMASCRIPT_TRIM_WHITESPACE,
        companyName: "\ufeff\u3000",
      }),
    );

    expect(status.complete).toBe(false);
    expect(status.missing).toEqual(["skills", "bioOrExperience"]);
  });

  it("uses the same trim semantics for required profile text", () => {
    const resume = resumeWith({ ...BASE_EXPERIENCE, roleTitle: "Guide" });
    const status = seekerResumeCompletion({
      ...resume,
      profile: resume.profile
        ? { ...resume.profile, location: ECMASCRIPT_TRIM_WHITESPACE }
        : null,
    });

    expect(status.complete).toBe(false);
    expect(status.missing).toEqual(["location"]);
  });

  it.each([
    ["role only", { roleTitle: "Guide", companyName: null }],
    ["employer only", { roleTitle: null, companyName: "Sunrise Orchard" }],
  ])("counts a %s experience", (_label, identity) => {
    const status = seekerResumeCompletion(
      resumeWith({ ...BASE_EXPERIENCE, ...identity }),
    );

    expect(status.complete).toBe(true);
    expect(status.missing).toEqual([]);
  });
});

describe("resume experience writers fail before Supabase client creation", () => {
  it("rejects an identity-less add", async () => {
    await expect(
      addResumeExperience("token", "user-1", {
        roleTitle: " ",
        companyName: null,
      }),
    ).resolves.toEqual({
      ok: false,
      error: RESUME_EXPERIENCE_IDENTITY_REQUIRED,
    });
    expect(authedClientMock).not.toHaveBeenCalled();
  });

  it("rejects an identity-less update", async () => {
    await expect(
      updateResumeExperience("token", "user-1", "experience-1", {
        roleTitle: null,
        companyName: ECMASCRIPT_TRIM_WHITESPACE,
      }),
    ).resolves.toEqual({
      ok: false,
      error: RESUME_EXPERIENCE_IDENTITY_REQUIRED,
    });
    expect(authedClientMock).not.toHaveBeenCalled();
  });
});
