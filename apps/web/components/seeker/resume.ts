import { RESUME_APPLY_THRESHOLD } from "./models";
import { SEEKER_STATUS } from "./fixtures";

/** Completion (0..100) recommended for stronger match confidence. */
export { RESUME_RECOMMENDED_THRESHOLD } from "./resumeThresholds";

export type ResumeSectionStatus = "complete" | "incomplete" | "optional";

export interface ResumeSection {
	readonly id: string;
	readonly title: string;
	readonly status: ResumeSectionStatus;
	readonly detail: string;
	readonly required: boolean;
}

export const RESUME_SECTIONS: readonly ResumeSection[] = [
	{
		id: "header",
		title: "Header",
		status: "complete",
		detail: "Name, short bio, relative location, availability",
		required: true,
	},
	{
		id: "looking_for",
		title: "What I'm looking for",
		status: "complete",
		detail: "Alaska, tour guiding for the summer",
		required: true,
	},
	{
		id: "positions",
		title: "Positions I'm open to",
		status: "complete",
		detail: "4 role tags",
		required: true,
	},
	{
		id: "experience",
		title: "Experience",
		status: "complete",
		detail: "3 experience cards",
		required: true,
	},
	{
		id: "education",
		title: "Education",
		status: "complete",
		detail: "1 education card",
		required: false,
	},
	{
		id: "skills",
		title: "Skills",
		status: "complete",
		detail: "9 skill tags",
		required: true,
	},
	{
		id: "certifications",
		title: "Certifications",
		status: "optional",
		detail: "Add certifications to boost match confidence",
		required: false,
	},
	{
		id: "preferences",
		title: "Preferences",
		status: "incomplete",
		detail: "Add pay expectation and travel readiness",
		required: true,
	},
];

export interface ResumeProgress {
	readonly completion: number;
	readonly applyThreshold: number;
	readonly recommendedThreshold: number;
	readonly canApply: boolean;
	/**
	 * The required sections still missing, straight from the apply gate. Lets
	 * the panel name what is actually outstanding instead of quoting a
	 * percentage — applying was never gated on one.
	 */
	readonly missing?: readonly string[];
	readonly sections: readonly ResumeSection[];
}

export const RESUME_PROGRESS: ResumeProgress = {
	completion: SEEKER_STATUS.resumeCompletion,
	applyThreshold: RESUME_APPLY_THRESHOLD,
	recommendedThreshold: RESUME_RECOMMENDED_THRESHOLD,
	canApply: SEEKER_STATUS.resumeCompletion >= RESUME_APPLY_THRESHOLD,
	sections: RESUME_SECTIONS,
};
