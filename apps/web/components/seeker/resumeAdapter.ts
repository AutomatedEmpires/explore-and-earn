import { RESUME_APPLY_THRESHOLD } from "./models";
import {
	RESUME_RECOMMENDED_THRESHOLD,
	type ResumeProgress,
	type ResumeSection,
} from "./resume";
import type { SeekerResume } from "@explore-and-earn/db";

/**
 * Real-data adapter for the seeker resume.
 *
 * `ResumePanel` consumes a `ResumeProgress` (see ./resume). Rather than refactor
 * that presentational component, we map the live `SeekerResume` (from
 * @explore-and-earn/db) into the shape it already understands.
 *
 * Completion is a deterministic signal count per the build brief: bio present,
 * >= 1 experience, >= 1 education. Each filled signal is worth an equal share of
 * 100%, so the value is one of 0 / 33 / 67 / 100.
 */

function hasBio(resume: SeekerResume): boolean {
	const bio = resume.profile?.bio;
	return typeof bio === "string" && bio.trim().length > 0;
}

/**
 * Resume completion — weighted:
 *   bio: 40 pts, experience: 40 pts, education: 15 pts, certifications: 5 pts
 * Bio + experience alone = 80%, which unlocks applying. Education and certs
 * push toward 100% for stronger match confidence.
 */
export function computeResumeCompletion(resume: SeekerResume): number {
	let score = 0;
	if (hasBio(resume)) score += 40;
	if (resume.experiences.length > 0) score += 40;
	if (resume.educations.length > 0) score += 15;
	if (resume.certifications.length > 0) score += 5;
	return Math.min(100, score);
}

/** Map a live resume into the ResumeProgress shape ResumePanel renders. */
export function toResumeProgress(resume: SeekerResume): ResumeProgress {
	const completion = computeResumeCompletion(resume);
	const experienceCount = resume.experiences.length;
	const educationCount = resume.educations.length;
	const certCount = resume.certifications.length;

	const sections: readonly ResumeSection[] = [
		{
			id: "bio",
			title: "Bio",
			status: hasBio(resume) ? "complete" : "incomplete",
			detail: hasBio(resume)
				? "Your short bio is set"
				: "Add a short bio so hosts get to know you",
			required: true,
		},
		{
			id: "experience",
			title: "Experience",
			status: experienceCount > 0 ? "complete" : "incomplete",
			detail:
				experienceCount > 0
					? `${experienceCount} experience ${experienceCount === 1 ? "card" : "cards"}`
					: "Add at least one experience",
			required: true,
		},
		{
			id: "education",
			title: "Education",
			status: educationCount > 0 ? "complete" : "optional",
			detail:
				educationCount > 0
					? `${educationCount} education ${educationCount === 1 ? "card" : "cards"}`
					: "Add education to boost match confidence",
			required: false,
		},
		{
			id: "certifications",
			title: "Certifications",
			status: certCount > 0 ? "complete" : "optional",
			detail:
				certCount > 0
					? `${certCount} certification${certCount === 1 ? "" : "s"}`
					: "PADI, CPR, food handler — boosts host confidence",
			required: false,
		},
	];

	return {
		completion,
		applyThreshold: RESUME_APPLY_THRESHOLD,
		recommendedThreshold: RESUME_RECOMMENDED_THRESHOLD,
		canApply: completion >= RESUME_APPLY_THRESHOLD,
		sections,
	};
}
