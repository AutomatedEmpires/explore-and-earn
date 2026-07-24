import { describe, expect, it, vi } from "vitest";

// @explore-and-earn/db's barrel pulls in server-only modules; the db package's
// own suites stub it the same way.
vi.mock("server-only", () => ({}));

import {
  isSeekerResumeComplete,
  seekerResumeCompletion,
  type SeekerResume,
} from "@explore-and-earn/db";

import {
  computeResumeCompletion,
  toResumeProgress,
} from "../../components/seeker/resumeAdapter";

/**
 * /resume and the apply gate must agree (UX review 2026-07-23).
 *
 * The defect this pins: the résumé page scored bio(40) + experience(40) +
 * education(15) + certifications(5), while applyToListing gates on displayName,
 * location, seekingTimeline, skills and bioOrExperience. Two definitions of
 * "complete", so the page contradicted the gate in BOTH directions:
 *
 *   - bio + experience → the page showed 80% and "You can apply now", then the
 *     apply was refused (no name/location/timeline/skills).
 *   - every required section satisfied via bio alone → the page showed 40% and
 *     "Reach 70% to unlock applying", while the seeker could already apply.
 *
 * The page now derives from the same contract, so the only way these can
 * disagree again is if someone reintroduces a second definition.
 */

function resume(overrides: Partial<SeekerResume["profile"]> = {}, rest: Partial<SeekerResume> = {}): SeekerResume {
  return {
    profile: {
      displayName: null,
      location: null,
      seekingTimeline: null,
      bio: null,
      generalSkills: [],
      ...overrides,
    },
    experiences: [],
    educations: [],
    certifications: [],
    ...rest,
  } as unknown as SeekerResume;
}

const COMPLETE = resume({
  displayName: "Ana",
  location: "Portland, OR",
  seekingTimeline: "Summer 2026",
  bio: "Orchard and trail work.",
  generalSkills: ["harvest"],
});

describe("résumé completion agrees with the apply gate", () => {
  it("reports 100% exactly when the gate says the seeker can apply", () => {
    expect(isSeekerResumeComplete(COMPLETE)).toBe(true);
    expect(computeResumeCompletion(COMPLETE)).toBe(100);
    expect(toResumeProgress(COMPLETE).canApply).toBe(true);
  });

  /** The old false-positive: 80% and "you can apply now", then blocked. */
  it("does NOT claim the seeker can apply on bio + experience alone", () => {
    const bioAndExperience = resume(
      { bio: "I pick fruit." },
      { experiences: [{ skillTags: [] }] as unknown as SeekerResume["experiences"] },
    );
    expect(isSeekerResumeComplete(bioAndExperience)).toBe(false);
    expect(toResumeProgress(bioAndExperience).canApply).toBe(false);
    expect(computeResumeCompletion(bioAndExperience)).toBeLessThan(100);
  });

  /** The old false-negative: able to apply, but told to "reach 70%". */
  it("does NOT understate a seeker who satisfies every required section", () => {
    expect(toResumeProgress(COMPLETE).completion).toBe(100);
    expect(toResumeProgress(COMPLETE).missing).toEqual([]);
  });

  it("education and certifications never move the apply verdict", () => {
    const decorated = resume(
      {
        displayName: "Ana",
        location: "Portland, OR",
        seekingTimeline: "Summer 2026",
        bio: "Orchard work.",
        generalSkills: ["harvest"],
      },
      {
        educations: [{}] as unknown as SeekerResume["educations"],
        certifications: [{}] as unknown as SeekerResume["certifications"],
      },
    );
    // Already complete without them, and they cannot push a blocked seeker over.
    expect(toResumeProgress(decorated).canApply).toBe(true);

    const onlyDecorations = resume(
      {},
      {
        educations: [{}] as unknown as SeekerResume["educations"],
        certifications: [{}] as unknown as SeekerResume["certifications"],
      },
    );
    expect(toResumeProgress(onlyDecorations).canApply).toBe(false);
    expect(toResumeProgress(onlyDecorations).completion).toBe(0);
  });

  it("names the sections the gate is actually waiting on", () => {
    const progress = toResumeProgress(resume({ displayName: "Ana" }));
    expect(progress.missing).toEqual(
      seekerResumeCompletion(resume({ displayName: "Ana" })).missing,
    );
    expect(progress.missing).not.toContain("displayName");
    expect(progress.missing).toContain("location");
  });

  /**
   * The negative control: across a spread of résumés, the page's canApply and
   * the server's gate must never disagree — that disagreement WAS the bug.
   */
  it("NEVER disagrees with the server gate, for any résumé shape", () => {
    const cases: SeekerResume[] = [
      resume(),
      resume({ displayName: "Ana" }),
      resume({ displayName: "Ana", location: "Portland, OR" }),
      resume({ displayName: "Ana", location: "Portland, OR", seekingTimeline: "Summer" }),
      resume({
        displayName: "Ana",
        location: "Portland, OR",
        seekingTimeline: "Summer",
        generalSkills: ["harvest"],
      }),
      COMPLETE,
      resume({ bio: "x" }, { experiences: [{ skillTags: ["a"] }] as unknown as SeekerResume["experiences"] }),
    ];
    for (const r of cases) {
      expect(toResumeProgress(r).canApply).toBe(isSeekerResumeComplete(r));
      expect(computeResumeCompletion(r)).toBe(seekerResumeCompletion(r).completion);
    }
  });
});
