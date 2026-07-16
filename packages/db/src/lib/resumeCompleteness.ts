import type { SeekerResume } from "../queries/seekerResume";
import { getSeekerResume } from "../queries/seekerResume";

/**
 * Server-authoritative résumé completeness gate.
 *
 * This is the single source of truth for "can this seeker apply?" — a pure
 * function over the real DB-backed SeekerResume shape. Both the server-side
 * apply gate (applyToListing) and the UI (ApplyButton / ResumePanel) call the
 * SAME logic so they never disagree. The fixture-driven SEEKER_STATUS /
 * RESUME_APPLY_THRESHOLD concept in apps/web is presentational only; THIS
 * boolean over live data is authoritative.
 *
 * A résumé is "complete enough to apply" when ALL of:
 *   1. displayName present
 *   2. location (relative_location) present
 *   3. seekingTimeline present
 *   4. at least one skill (generalSkills OR any experience.skillTags)
 *   5. bio (short_bio) present OR at least one experience row
 */

/** Stable identifiers for the required résumé sections that gate applying. */
export type ResumeMissingSection =
  | "displayName"
  | "location"
  | "seekingTimeline"
  | "skills"
  | "bioOrExperience";

export interface SeekerResumeStatus {
  /** Authoritative: true only when every required section is satisfied. */
  readonly complete: boolean;
  /** 0..100 completion over the required sections (for UI progress). */
  readonly completion: number;
  /** Which required sections are still missing (empty when complete). */
  readonly missing: ResumeMissingSection[];
}

/** Trim-aware presence check for nullable strings. */
function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Evaluate every required section. Returned in a fixed order so `missing`
 * is deterministic and `completion` is a stable fraction of the same set.
 */
function evaluateSections(
  resume: SeekerResume,
): ReadonlyArray<{ section: ResumeMissingSection; satisfied: boolean }> {
  const profile = resume.profile;
  const experiences = resume.experiences ?? [];

  const hasSkill =
    (profile?.generalSkills?.length ?? 0) > 0 ||
    experiences.some((exp) => (exp.skillTags?.length ?? 0) > 0);

  const hasBioOrExperience = hasText(profile?.bio) || experiences.length > 0;

  return [
    { section: "displayName", satisfied: hasText(profile?.displayName) },
    { section: "location", satisfied: hasText(profile?.location) },
    { section: "seekingTimeline", satisfied: hasText(profile?.seekingTimeline) },
    { section: "skills", satisfied: hasSkill },
    { section: "bioOrExperience", satisfied: hasBioOrExperience },
  ];
}

/**
 * Pure boolean gate — true when the résumé satisfies every required section.
 * A missing profile (null) is never complete.
 */
export function isSeekerResumeComplete(resume: SeekerResume): boolean {
  if (!resume.profile) return false;
  return evaluateSections(resume).every((s) => s.satisfied);
}

/**
 * Pure status object for the UI: the boolean, a 0..100 completion number, and
 * the list of still-missing required sections.
 */
export function seekerResumeCompletion(
  resume: SeekerResume,
): SeekerResumeStatus {
  const sections = evaluateSections(resume);
  const satisfiedCount = sections.filter((s) => s.satisfied).length;
  const completion = Math.round((satisfiedCount / sections.length) * 100);
  const missing = sections
    .filter((s) => !s.satisfied)
    .map((s) => s.section);

  return {
    complete: missing.length === 0 && resume.profile != null,
    completion,
    missing,
  };
}

/**
 * Convenience loader: fetch the authed seeker's résumé and return its status.
 * Lets the listing page + ApplyButton read the gate without re-implementing
 * the completeness logic. `clerkUserId` MUST come from auth().userId.
 */
export async function getSeekerResumeStatus(
  clerkToken: string,
  clerkUserId: string,
): Promise<SeekerResumeStatus> {
  const resume = await getSeekerResume(clerkToken, clerkUserId);
  return seekerResumeCompletion(resume);
}
