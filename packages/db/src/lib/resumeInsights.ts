/**
 * Résumé intelligence engine — pure, deterministic analysis of a seeker's
 * STORED resume (queries/seekerResume.ts shapes). No model, no I/O: skills are
 * either parsed (explicit tags on real rows) or inferred by transparent
 * lexicon matching against the actual summary/description text, always with
 * provenance (which row, which field, which excerpt) and a confidence grade.
 *
 * Output is analysis + PROPOSALS only. Nothing here writes anywhere; a
 * suggestion becomes canonical data only when the user accepts it through the
 * owner-authenticated resume actions (charter §2.4: review-before-publish).
 */

import { hasResumeExperienceIdentity } from "@explore-and-earn/contracts"
import type {
	ListingPreparation,
	ResumeConflict,
	ResumeEvidence,
	ResumeGap,
	ResumeInsights,
	ResumeSuggestion,
	SkillWithProvenance,
} from "@explore-and-earn/contracts"

import type { SeekerResume } from "../queries/seekerResume"

/* ----------------------------------------------------------------- lexicon */

/**
 * Deterministic skill lexicon for seasonal/lifestyle work — the transparent
 * inference dictionary. A term only becomes an inferred skill when it appears
 * as a whole word in a summary/description the seeker actually wrote, and the
 * excerpt ships with the inference. Deliberately modest: precision over reach.
 */
const SKILL_LEXICON: ReadonlyArray<{ skill: string; patterns: readonly string[] }> = [
	// Farm
	{ skill: "harvesting", patterns: ["harvest", "harvesting", "picked", "picking"] },
	{ skill: "livestock care", patterns: ["livestock", "cattle", "sheep", "goats", "chickens"] },
	{ skill: "tractor operation", patterns: ["tractor", "tractors"] },
	{ skill: "irrigation", patterns: ["irrigation", "irrigating"] },
	{ skill: "gardening", patterns: ["garden", "gardening", "greenhouse"] },
	// Maritime
	{ skill: "deckhand work", patterns: ["deckhand", "deck hand"] },
	{ skill: "sailing", patterns: ["sailing", "sailboat", "skipper"] },
	{ skill: "boat maintenance", patterns: ["boat maintenance", "hull", "rigging"] },
	{ skill: "fishing", patterns: ["fishing", "fishery", "fisheries"] },
	// Hospitality / seasonal
	{ skill: "housekeeping", patterns: ["housekeeping", "housekeeper"] },
	{ skill: "cooking", patterns: ["cook", "cooking", "chef", "kitchen"] },
	{ skill: "serving", patterns: ["server", "waitress", "waiter", "serving tables"] },
	{ skill: "bartending", patterns: ["bartender", "bartending"] },
	{ skill: "front desk", patterns: ["front desk", "reception", "receptionist"] },
	{ skill: "guest services", patterns: ["guest services", "guest experience", "concierge"] },
	{ skill: "guiding", patterns: ["tour guide", "guiding", "guided tours", "raft guide"] },
	{ skill: "ski operations", patterns: ["ski lift", "lift operator", "ski patrol", "snowmaking"] },
	// Remote / general
	{ skill: "customer support", patterns: ["customer support", "customer service", "help desk"] },
	{ skill: "social media", patterns: ["social media", "instagram", "content creation"] },
	{ skill: "bookkeeping", patterns: ["bookkeeping", "bookkeeper", "accounting"] },
	{ skill: "carpentry", patterns: ["carpentry", "carpenter", "woodworking"] },
	{ skill: "maintenance", patterns: ["maintenance", "repairs", "handyman"] },
	{ skill: "driving", patterns: ["driver", "driving", "cdl", "delivery"] },
	{ skill: "first aid", patterns: ["first aid", "cpr", "wilderness first responder", "wfr", "emt"] },
	{ skill: "childcare", patterns: ["childcare", "nanny", "au pair", "babysitting"] },
	{ skill: "teaching", patterns: ["teaching", "teacher", "tutor", "instructor"] },
	{ skill: "photography", patterns: ["photography", "photographer"] },
	{ skill: "leadership", patterns: ["supervised", "managed a team", "team lead", "leadership"] },
]

const norm = (value: string): string => value.trim().toLowerCase()

/** Whole-word, case-insensitive search; returns a short excerpt or null. */
function findPattern(text: string, pattern: string): string | null {
	const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
	const re = new RegExp(`(?:^|[^a-z0-9])(${escaped})(?:[^a-z0-9]|$)`, "i")
	const match = re.exec(text)
	if (!match || match.index === undefined) return null
	const start = Math.max(0, match.index - 30)
	const end = Math.min(text.length, match.index + match[0].length + 30)
	return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`
}

/* ------------------------------------------------------------------ skills */

function collectSkills(resume: SeekerResume): SkillWithProvenance[] {
	const profileSkills = new Set(
		(resume.profile?.generalSkills ?? []).map(norm),
	)
	const bySkill = new Map<
		string,
		{ kind: "parsed" | "inferred"; evidence: ResumeEvidence[] }
	>()

	const addParsed = (skill: string, evidence: ResumeEvidence): void => {
		const key = norm(skill)
		if (!key) return
		const entry = bySkill.get(key)
		if (entry) {
			entry.kind = "parsed" // parsed beats inferred
			entry.evidence.push(evidence)
		} else {
			bySkill.set(key, { kind: "parsed", evidence: [evidence] })
		}
	}

	const addInferred = (skill: string, evidence: ResumeEvidence): void => {
		const key = norm(skill)
		if (!key) return
		const entry = bySkill.get(key)
		if (entry) entry.evidence.push(evidence)
		else bySkill.set(key, { kind: "inferred", evidence: [evidence] })
	}

	// Parsed: explicit skill tags on real rows.
	for (const skill of resume.profile?.generalSkills ?? []) {
		addParsed(skill, { source: "profile", sourceId: null, field: "general_skill_tags" })
	}
	for (const exp of resume.experiences) {
		for (const skill of exp.skillTags) {
			addParsed(skill, { source: "experience", sourceId: exp.id, field: "skill_tags" })
		}
	}
	for (const edu of resume.educations) {
		for (const skill of edu.skillTags) {
			addParsed(skill, { source: "education", sourceId: edu.id, field: "skill_tags" })
		}
	}
	for (const cert of resume.certifications) {
		for (const skill of cert.skillTags) {
			addParsed(skill, { source: "certification", sourceId: cert.id, field: "skill_tags" })
		}
	}

	// Inferred: lexicon terms found in text the seeker actually wrote.
	const texts: Array<{ text: string; evidence: Omit<ResumeEvidence, "excerpt"> }> = []
	for (const exp of resume.experiences) {
		if (exp.summary?.trim()) {
			texts.push({
				text: exp.summary,
				evidence: { source: "experience", sourceId: exp.id, field: "summary" },
			})
		}
	}
	for (const edu of resume.educations) {
		if (edu.description?.trim()) {
			texts.push({
				text: edu.description,
				evidence: { source: "education", sourceId: edu.id, field: "description" },
			})
		}
	}

	for (const { text, evidence } of texts) {
		for (const { skill, patterns } of SKILL_LEXICON) {
			for (const pattern of patterns) {
				const excerpt = findPattern(text, pattern)
				if (excerpt) {
					addInferred(skill, { ...evidence, excerpt })
					break // one hit per lexicon entry per text block
				}
			}
		}
	}

	return [...bySkill.entries()]
		.map(([skill, { kind, evidence }]): SkillWithProvenance => ({
			skill,
			onProfile: profileSkills.has(skill),
			kind,
			// Parsed tags are the seeker's own words → high. Inferred terms grade
			// by independent supporting sources.
			confidence:
				kind === "parsed" ? "high" : evidence.length >= 2 ? "medium" : "low",
			evidence,
		}))
		.sort((a, b) => a.skill.localeCompare(b.skill))
}

/* ------------------------------------------------------------ gaps + dupes */

function collectGaps(resume: SeekerResume): ResumeGap[] {
	const gaps: ResumeGap[] = []
	const profile = resume.profile
	if (!profile?.bio?.trim()) gaps.push({ code: "missing_bio" })
	if (!profile?.displayName?.trim()) gaps.push({ code: "missing_display_name" })
	if (resume.experiences.length === 0) gaps.push({ code: "no_experience" })
	for (const exp of resume.experiences) {
		if (!exp.summary?.trim()) {
			gaps.push({ code: "experience_without_summary", sourceId: exp.id })
		}
	}
	if (resume.educations.length === 0) gaps.push({ code: "no_education" })
	const hasAnySkill =
		(profile?.generalSkills.length ?? 0) > 0 ||
		resume.experiences.some((e) => e.skillTags.length > 0)
	if (!hasAnySkill) gaps.push({ code: "no_skills" })
	if (resume.certifications.length === 0) gaps.push({ code: "no_certifications" })
	if ((profile?.desiredCategories.length ?? 0) === 0) {
		gaps.push({ code: "missing_desired_categories" })
	}
	if (!profile?.location?.trim()) gaps.push({ code: "missing_location" })
	if (!profile?.seekingTimeline) gaps.push({ code: "missing_seeking_timeline" })
	return gaps
}

const parseDate = (value: string | null): number | null => {
	if (!value) return null
	const ms = Date.parse(value)
	return Number.isFinite(ms) ? ms : null
}

function collectConflicts(resume: SeekerResume, nowMs: number): ResumeConflict[] {
	const conflicts: ResumeConflict[] = []

	for (const exp of resume.experiences) {
		const start = parseDate(exp.startDate)
		const end = parseDate(exp.endDate)
		if (start != null && end != null && end < start) {
			conflicts.push({ code: "experience_dates_inverted", sourceId: exp.id })
		}
		if (exp.isCurrent && exp.endDate) {
			conflicts.push({ code: "current_role_with_end_date", sourceId: exp.id })
		}
	}

	for (const edu of resume.educations) {
		const start = parseDate(edu.startDate)
		const end = parseDate(edu.endDate)
		if (start != null && end != null && end < start) {
			conflicts.push({ code: "education_dates_inverted", sourceId: edu.id })
		}
	}

	// Duplicates: same normalized company + role.
	const seen = new Map<string, string>()
	for (const exp of resume.experiences) {
		const key = `${norm(exp.companyName ?? "")}|${norm(exp.roleTitle ?? "")}`
		if (key === "|") continue
		const priorId = seen.get(key)
		if (priorId) {
			conflicts.push({
				code: "duplicate_experience",
				sourceId: exp.id,
				relatedSourceId: priorId,
			})
		} else {
			seen.set(key, exp.id)
		}
	}

	for (const cert of resume.certifications) {
		if (cert.doesNotExpire) continue
		const expires = parseDate(cert.expiresAt)
		if (expires != null && expires < nowMs) {
			conflicts.push({
				code: "certification_expired",
				sourceId: cert.id,
				detail: cert.name,
			})
		}
	}

	return conflicts
}

/* -------------------------------------------------------------- suggestions */

function collectSuggestions(
	skills: readonly SkillWithProvenance[],
	gaps: readonly ResumeGap[],
	conflicts: readonly ResumeConflict[],
): ResumeSuggestion[] {
	const suggestions: ResumeSuggestion[] = []

	// Skills found in the seeker's own records but absent from the profile.
	for (const skill of skills) {
		if (skill.onProfile) continue
		suggestions.push({
			kind: "add_general_skill",
			value: skill.skill,
			confidence: skill.confidence,
			evidence: skill.evidence,
			addresses: "no_skills",
		})
	}

	for (const gap of gaps) {
		if (gap.code === "experience_without_summary" && gap.sourceId) {
			suggestions.push({
				kind: "add_experience_summary",
				value: gap.sourceId,
				confidence: "high",
				evidence: [
					{ source: "experience", sourceId: gap.sourceId, field: "summary" },
				],
				addresses: gap.code,
			})
		}
		if (
			gap.code === "missing_bio" ||
			gap.code === "missing_desired_categories" ||
			gap.code === "missing_location" ||
			gap.code === "missing_seeking_timeline"
		) {
			suggestions.push({
				kind: "complete_profile_field",
				value: gap.code.replace(/^missing_/, ""),
				confidence: "high",
				evidence: [],
				addresses: gap.code,
			})
		}
	}

	for (const conflict of conflicts) {
		suggestions.push({
			kind: "resolve_conflict",
			value: conflict.sourceId,
			confidence: "high",
			evidence: [],
			addresses: conflict.code,
		})
	}

	return suggestions
}

/* ------------------------------------------------------------- completeness */

/**
 * 0–100 readiness. Mirrors the spirit of the resume-builder heuristic
 * (bio/info/experience/education/skills weighted) — kept pure + local so this
 * package stays UI-independent.
 */
function computeCompleteness(resume: SeekerResume): number {
	const profile = resume.profile
	const checks: Array<[boolean, number]> = [
		[Boolean(profile?.bio?.trim()), 20],
		[Boolean(profile?.displayName?.trim()), 10],
		[(profile?.desiredCategories.length ?? 0) > 0, 15],
		[resume.experiences.length > 0, 25],
		[resume.experiences.some((e) => Boolean(e.summary?.trim())), 10],
		[resume.educations.length > 0, 10],
		[
			(profile?.generalSkills.length ?? 0) > 0 ||
				resume.experiences.some((e) => e.skillTags.length > 0),
			10,
		],
	]
	return checks.reduce((sum, [ok, weight]) => sum + (ok ? weight : 0), 0)
}

/* ------------------------------------------------------------------ public */

/** Full deterministic analysis. Inject nowMs for reproducibility. */
export function analyzeResume(resume: SeekerResume, nowMs: number): ResumeInsights {
	const meaningfulResume: SeekerResume = {
		...resume,
		experiences: resume.experiences.filter(hasResumeExperienceIdentity),
	}
	const skills = collectSkills(meaningfulResume)
	const gaps = collectGaps(meaningfulResume)
	const conflicts = collectConflicts(meaningfulResume, nowMs)
	return {
		completeness: computeCompleteness(meaningfulResume),
		skills,
		gaps,
		conflicts,
		suggestions: collectSuggestions(skills, gaps, conflicts),
		counts: {
			experiences: meaningfulResume.experiences.length,
			educations: resume.educations.length,
			certifications: resume.certifications.length,
		},
	}
}

/**
 * Listing-specific preparation: which of the listing's REQUIRED skills/certs
 * the resume actually covers (with evidence) and which are missing. Missing
 * stays missing — no invented qualifications, ever.
 */
export function prepareForListing(
	insights: ResumeInsights,
	listing: {
		readonly requiredSkillTags?: readonly string[] | null
		readonly requiredCertifications?: readonly string[] | null
	},
	certifications: ReadonlyArray<{ readonly name: string }>,
): ListingPreparation {
	const skillByName = new Map(insights.skills.map((s) => [norm(s.skill), s]))
	const coveredSkills: SkillWithProvenance[] = []
	const missingSkills: string[] = []
	for (const required of listing.requiredSkillTags ?? []) {
		const hit = skillByName.get(norm(required))
		if (hit) coveredSkills.push(hit)
		else missingSkills.push(required)
	}

	const ownedCerts = new Set(certifications.map((c) => norm(c.name)))
	const coveredCertifications: string[] = []
	const missingCertifications: string[] = []
	for (const required of listing.requiredCertifications ?? []) {
		if (ownedCerts.has(norm(required))) coveredCertifications.push(required)
		else missingCertifications.push(required)
	}

	return { coveredSkills, missingSkills, coveredCertifications, missingCertifications }
}
