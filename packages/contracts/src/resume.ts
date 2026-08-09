/**
 * The minimum identity that turns a stored row into a real resume experience.
 *
 * Role-only and employer/place-only records are both legitimate: informal,
 * self-employed, and volunteer work does not always have both. Dates, location,
 * summaries, categories, and skill tags describe an experience, but none can
 * identify one on their own.
 */
export interface ResumeExperienceIdentity {
	readonly roleTitle?: string | null
	readonly companyName?: string | null
}

/** Canonical stored/display form for the two experience identity fields. */
export interface NormalizedResumeExperienceIdentity {
	readonly roleTitle: string | null
	readonly companyName: string | null
}

/** Stable domain error returned when an experience has no usable identity. */
export const RESUME_EXPERIENCE_IDENTITY_REQUIRED =
	"experience_identity_required" as const

/** Shared user-facing explanation for the one-of-two identity requirement. */
export const RESUME_EXPERIENCE_IDENTITY_REQUIRED_MESSAGE =
	"Add a role title or the employer or place where you worked." as const

/** Trim identity fields and represent empty-after-trim values as absent. */
export function normalizeResumeExperienceIdentity(
	value: ResumeExperienceIdentity,
): NormalizedResumeExperienceIdentity {
	return {
		roleTitle: value.roleTitle?.trim() || null,
		companyName: value.companyName?.trim() || null,
	}
}

/** True only when at least one identity field contains non-whitespace text. */
export function hasResumeExperienceIdentity(
	value: ResumeExperienceIdentity,
): boolean {
	const identity = normalizeResumeExperienceIdentity(value)
	return identity.roleTitle !== null || identity.companyName !== null
}
