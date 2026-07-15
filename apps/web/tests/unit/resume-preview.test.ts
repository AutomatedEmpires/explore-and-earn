import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SeekerResume } from "@explore-and-earn/db";

import {
  buildResumePreview,
  getResumeAdvanceLabel,
} from "../../components/seeker/resumePreview.ts";

const persistedResume: SeekerResume = {
  profile: {
    seekerProfileId: "profile-1",
    bio: "Persisted bio",
    headline: "Seasonal worker",
    displayName: "Mara Rivera",
    location: "Bend, OR",
    seekingTimeline: "3_months",
    desiredCategories: ["seasonal"],
    generalSkills: ["Guest Service"],
  },
  experiences: [
    {
      id: "experience-1",
      companyName: "Pine Lodge",
      roleTitle: "Guest host",
      location: "Bend, OR",
      startDate: "2025-04",
      endDate: "2025-09",
      isCurrent: false,
      summary: "Welcomed guests.",
      categoryTags: ["seasonal"],
      skillTags: ["Guest Service"],
    },
  ],
  educations: [
    {
      id: "education-1",
      institution: "Central Oregon Community College",
      programOrDegree: "Hospitality certificate",
      location: "Bend, OR",
      startDate: "2024-01",
      endDate: "2024-06",
      isCurrent: false,
      description: "Persisted education notes.",
      skillTags: ["Customer Communication"],
    },
  ],
  certifications: [],
};

describe("buildResumePreview", () => {
  it("merges current profile fields and an unsaved entry without mutating persisted data", () => {
    const result = buildResumePreview(persistedResume, {
      profile: {
        displayName: "Mara R.",
        bio: "Draft bio typed in the builder.",
      },
      experience: {
        id: "preview:experience",
        companyName: "Juniper Farm",
        roleTitle: "Farmhand",
        location: "Redmond, OR",
        startDate: "2026-05",
        endDate: null,
        isCurrent: true,
        summary: "Current unsaved experience.",
        categoryTags: ["farm"],
        skillTags: ["Equipment Operation"],
      },
    });

    assert.equal(result.profile?.displayName, "Mara R.");
    assert.equal(result.profile?.bio, "Draft bio typed in the builder.");
    assert.equal(result.profile?.headline, "Seasonal worker");
    assert.equal(result.experiences.length, 2);
    assert.equal(result.experiences[1]?.roleTitle, "Farmhand");

    assert.equal(persistedResume.profile?.displayName, "Mara Rivera");
    assert.equal(persistedResume.experiences.length, 1);
  });

  it("replaces the matching persisted entry while it is edited", () => {
    const currentEducation = persistedResume.educations[0];
    assert.ok(currentEducation);

    const result = buildResumePreview(persistedResume, {
      education: {
        ...currentEducation,
        description: "Current unsaved education notes.",
      },
    });

    assert.equal(result.educations.length, 1);
    assert.equal(
      result.educations[0]?.description,
      "Current unsaved education notes.",
    );
    assert.equal(
      persistedResume.educations[0]?.description,
      "Persisted education notes.",
    );
  });

  it("builds a complete preview profile when the persisted profile is absent", () => {
    const result = buildResumePreview(
      {
        profile: null,
        experiences: [],
        educations: [],
        certifications: [],
      },
      {
        profile: {
          displayName: "New seeker",
          location: "Astoria, OR",
          generalSkills: ["Boating"],
        },
      },
    );

    assert.equal(result.profile?.displayName, "New seeker");
    assert.equal(result.profile?.location, "Astoria, OR");
    assert.deepEqual(result.profile?.generalSkills, ["Boating"]);
    assert.equal(result.profile?.bio, null);
    assert.deepEqual(result.profile?.desiredCategories, []);
  });
});

describe("getResumeAdvanceLabel", () => {
  it("does not claim that advancing saves the active form", () => {
    assert.equal(getResumeAdvanceLabel(0), "Continue");
    assert.equal(getResumeAdvanceLabel(1), "Continue");
    assert.equal(getResumeAdvanceLabel(3), "Review resume");
  });
});
