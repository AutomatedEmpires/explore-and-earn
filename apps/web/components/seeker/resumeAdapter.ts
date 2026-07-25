// Types only from ./resume (erased at build time) — a VALUE import there pulls
// its fixture exports and, through ./models, the discovery component barrel.
import type { ResumeProgress, ResumeSection } from "./resume";
import { RESUME_RECOMMENDED_THRESHOLD } from "./resumeThresholds";
import {
	seekerResumeCompletion,
	type ResumeMissingSection,
	type SeekerResume,
} from "@explore-and-earn/db";

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
 * Résumé completion, measured against the SAME sections the apply gate
 * enforces.
 *
 * This used to be its own weighting (bio 40 / experience 40 / education 15 /
 * certifications 5) with a comment claiming "bio + experience alone = 80%,
 * which unlocks applying". That was false in both directions, and the number
 * fed /resume, /profile and the seeker dashboard:
 *
 *   - A seeker with bio + experience saw 80% and "You can apply now", then was
 *     blocked, because the gate ALSO requires displayName, location,
 *     seekingTimeline and skills.
 *   - A seeker who satisfied every required section via bio alone saw 40% and
 *     "Reach 70% to unlock applying" — while already able to apply.
 *
 * Applying was never gated on a percentage at all; seekerResumeCompletion is
 * the server-authoritative contract (the same one applyToListing calls), so
 * deferring to it is what makes the number mean something.
 */
export function computeResumeCompletion(resume: SeekerResume): number {
	return seekerResumeCompletion(resume).completion;
}

/**
 * Map a live résumé into the ResumeProgress shape ResumePanel renders.
 *
 * The REQUIRED sections mirror the apply gate exactly (and are derived from its
 * own `missing` list, so they cannot drift). Education and certifications stay
 * as clearly-optional strengtheners: they help a host judge an applicant, but
 * they never gated applying and must no longer inflate a number that implies
 * they do.
 */
export function toResumeProgress(resume: SeekerResume): ResumeProgress {
	const status = seekerResumeCompletion(resume);
	const missing = new Set(status.missing);
	const isMissing = (section: ResumeMissingSection) => missing.has(section);

	const experienceCount = resume.experiences.length;
	const educationCount = resume.educations.length;
	const certCount = resume.certifications.length;

	const sections: readonly ResumeSection[] = [
		{
			id: "displayName",
			title: "Your name",
			status: isMissing("displayName") ? "incomplete" : "complete",
			detail: isMissing("displayName")
				? "Hosts need a name to put to your application"
				: "Set",
			required: true,
		},
		{
			id: "location",
			title: "Where you're based",
			status: isMissing("location") ? "incomplete" : "complete",
			detail: isMissing("location")
				? "Add your general location — hosts plan travel around it"
				: "Set",
			required: true,
		},
		{
			id: "seekingTimeline",
			title: "When you're available",
			status: isMissing("seekingTimeline") ? "incomplete" : "complete",
			detail: isMissing("seekingTimeline")
				? "Add the window you're looking to work"
				: "Set",
			required: true,
		},
		{
			id: "skills",
			title: "Skills",
			status: isMissing("skills") ? "incomplete" : "complete",
			detail: isMissing("skills")
				? "Add at least one skill, or tag skills on an experience"
				: "Set",
			required: true,
		},
		{
			id: "bioOrExperience",
			title: "Bio or experience",
			status: isMissing("bioOrExperience") ? "incomplete" : "complete",
			detail: isMissing("bioOrExperience")
				? "Add a short bio, or at least one experience"
				: hasBio(resume)
					? "Your short bio is set"
					: `${experienceCount} experience ${experienceCount === 1 ? "card" : "cards"}`,
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
		completion: status.completion,
		// Every required section, not an arbitrary percentage: applying was never
		// gated on a number, and saying it was is what let the page contradict
		// the gate.
		applyThreshold: 100,
		recommendedThreshold: RESUME_RECOMMENDED_THRESHOLD,
		canApply: status.complete,
		missing: status.missing,
		sections,
	};
}
