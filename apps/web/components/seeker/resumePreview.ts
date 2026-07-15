import type {
  SeekerCertification,
  SeekerResume,
  SeekerResumeEducation,
  SeekerResumeExperience,
  SeekerResumeProfile,
} from "@explore-and-earn/db";

export interface ResumePreviewDraft {
  readonly profile?: Partial<SeekerResumeProfile>;
  readonly experience?: SeekerResumeExperience;
  readonly education?: SeekerResumeEducation;
  readonly certification?: SeekerCertification;
}

const EMPTY_PREVIEW_PROFILE: SeekerResumeProfile = {
  seekerProfileId: "preview:profile",
  bio: null,
  headline: null,
  displayName: null,
  location: null,
  seekingTimeline: null,
  desiredCategories: [],
  generalSkills: [],
};

function upsertPreviewEntry<T extends { readonly id: string }>(
  entries: readonly T[],
  draft: T | undefined,
): readonly T[] {
  if (!draft) return entries;

  const exists = entries.some((entry) => entry.id === draft.id);
  if (!exists) return [...entries, draft];

  return entries.map((entry) => (entry.id === draft.id ? draft : entry));
}

/**
 * Projects persisted resume data plus the one form draft currently visible in
 * the builder. The function is deliberately side-effect free: previewing a
 * draft never changes the persisted snapshot used by save actions.
 */
export function buildResumePreview(
  persisted: SeekerResume,
  draft: ResumePreviewDraft,
): SeekerResume {
  return {
    profile: draft.profile
      ? {
          ...(persisted.profile ?? EMPTY_PREVIEW_PROFILE),
          ...draft.profile,
        }
      : persisted.profile,
    experiences: upsertPreviewEntry(
      persisted.experiences,
      draft.experience,
    ),
    educations: upsertPreviewEntry(persisted.educations, draft.education),
    certifications: upsertPreviewEntry(
      persisted.certifications,
      draft.certification,
    ),
  };
}

export function getResumeAdvanceLabel(step: number): "Continue" | "Review resume" {
  return step === 3 ? "Review resume" : "Continue";
}
