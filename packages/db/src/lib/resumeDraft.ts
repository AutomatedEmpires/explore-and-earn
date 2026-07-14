/**
 * Shared résumé DRAFT shape — the contract between the résumé-import parser
 * (which fills a draft from the seeker's actual uploaded/pasted content) and
 * the CRUD layer (which persists it after the seeker reviews & confirms).
 *
 * IMPORTANT: a draft is proposed content ONLY. Nothing here is authoritative or
 * saved until the seeker reviews and confirms; the parser must NEVER invent
 * data — every field is optional and populated solely from real input.
 *
 * Field names mirror what the CRUD inputs accept (SeekerProfileInfoInput,
 * ResumeExperienceInput, ResumeEducationInput, ResumeCertificationInput) so the
 * import agent and CRUD agree without a translation layer.
 */

export interface ResumeDraftProfileInfo {
  readonly displayName?: string | null;
  readonly location?: string | null;
  readonly seekingTimeline?: string | null;
  readonly desiredCategories?: string[];
  readonly generalSkills?: string[];
  /** maps to seeker_profiles.short_bio via updateSeekerProfileBio */
  readonly bio?: string | null;
}

export interface ResumeDraftExperience {
  readonly companyName?: string;
  readonly roleTitle?: string;
  readonly location?: string | null;
  readonly startDate?: string | null;
  readonly endDate?: string | null;
  readonly isCurrent?: boolean;
  readonly summary?: string;
  readonly categoryTags?: string[];
  readonly skillTags?: string[];
}

export interface ResumeDraftEducation {
  readonly institution?: string;
  readonly programOrDegree?: string;
  readonly location?: string | null;
  readonly startDate?: string | null;
  readonly endDate?: string | null;
  readonly isCurrent?: boolean;
  readonly description?: string;
  readonly skillTags?: string[];
}

export interface ResumeDraftCertification {
  readonly name: string;
  readonly issuingOrganization?: string;
  readonly issuedAt?: string | null;
  readonly expiresAt?: string | null;
  readonly doesNotExpire?: boolean;
  readonly description?: string | null;
  readonly credentialUrl?: string;
  readonly categoryTags?: string[];
  readonly skillTags?: string[];
}

/**
 * The full draft the import parser targets and the review UI renders before
 * the seeker confirms. All sections optional — the parser fills only what the
 * source actually contained.
 */
export interface ResumeDraft {
  readonly profileInfo?: ResumeDraftProfileInfo;
  readonly experiences?: ResumeDraftExperience[];
  readonly educations?: ResumeDraftEducation[];
  readonly certifications?: ResumeDraftCertification[];
}
