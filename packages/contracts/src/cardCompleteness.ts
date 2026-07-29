/**
 * Card record completeness — the honest "what's missing" derivation (V2-G).
 *
 * WHY THIS IS A CONTRACT AND NOT A COMPONENT DETAIL.
 *
 * The triad honesty rules already say a benefit nobody answered must render as
 * "Not stated" rather than as "no". They do not, on their own, stop the card
 * from LOOKING complete: a listing with no dates, no location, no pay range and
 * no stated housing still renders as a full card with four quiet fallbacks, and
 * a seeker reads quiet as ordinary. The absences have to be counted somewhere,
 * named, and shown together, or each one hides behind the others.
 *
 * So the count lives here, next to the rules it enforces, where it is pure and
 * testable and the same numbers reach every surface. Two consequences follow:
 *
 *   · The card never invents a value to fill a gap. It names the gap.
 *   · Confidence is REDUCED, not zeroed. An incomplete record is still a real
 *     opportunity from a real host; the card says how much of it is answered
 *     and lets the seeker decide.
 */

import type { BenefitProvision } from "./benefits"
import { benefitCardState } from "./listingPublication"
import type { BenefitEvidenceStatus } from "./provenance"

/** Every fact a discovery card asks a listing for. */
export const CARD_RECORD_FACTS = [
	"location",
	"dates",
	"housing",
	"meals",
	"pay",
] as const
export type CardRecordFact = (typeof CARD_RECORD_FACTS)[number]

/** Seeker-facing name for a missing fact. Short — these render in a row. */
export const CARD_RECORD_FACT_LABEL: Record<CardRecordFact, string> = {
	location: "location",
	dates: "dates",
	housing: "housing",
	meals: "meals",
	pay: "pay",
}

export interface CardRecordInput {
	/** The card's location string; the "not specified" sentinel counts as absent. */
	readonly location?: string
	readonly begins?: string
	readonly ends?: string
	/** Host-authored window text ("Rolling", "Aug–Oct 2026"); "Open" counts as absent. */
	readonly opportunityWindow?: string
	readonly housingProvision?: BenefitProvision
	readonly mealsProvision?: BenefitProvision
	/** Pay display string. A pay range or summary; empty counts as absent. */
	readonly payValue?: string
	readonly benefitEvidence?: {
		readonly housing?: BenefitEvidenceStatus
		readonly meals?: BenefitEvidenceStatus
		readonly pay?: BenefitEvidenceStatus
	}
}

export interface CardRecordCompleteness {
	/** Facts this listing does NOT answer, in CARD_RECORD_FACTS order. */
	readonly missing: readonly CardRecordFact[]
	/** 0–100, answered ÷ total. Never rounded up past a real gap. */
	readonly completeness: number
	/**
	 * True when enough is missing that the card must visibly reduce its
	 * confidence rather than present as an ordinary, fully-answered listing.
	 */
	readonly reducedConfidence: boolean
}

/**
 * The sentinel the DB mapper writes when `location_display` is null. Treated as
 * ABSENT here — it is the absence of a location wearing a sentence.
 */
export const LOCATION_UNSPECIFIED = "Location not specified"

/** The sentinel formatOpportunityWindow returns when no timing is known. */
export const WINDOW_UNSPECIFIED = "Open"

/**
 * One or more unanswered facts already warrants a note; TWO is where the card
 * stops presenting as an ordinary listing. Chosen rather than derived so the
 * threshold is visible and arguable instead of buried in a percentage.
 */
export const REDUCED_CONFIDENCE_MISSING_COUNT = 2

function benefitAnswered(
	provision: BenefitProvision | undefined,
	evidence: BenefitEvidenceStatus | undefined,
): boolean {
	if (provision === undefined) return false
	// "not_stated" is the whole point: an unanswered benefit is missing data,
	// even though the boolean column underneath holds a perfectly good `false`.
	return benefitCardState(provision, evidence) !== "not_stated"
}

/**
 * Which of the card's facts this listing actually answers.
 *
 * Pure. Callers pass the same values the card renders, so the note can never
 * disagree with the card it sits under.
 */
export function cardRecordCompleteness(
	input: CardRecordInput,
): CardRecordCompleteness {
	const missing: CardRecordFact[] = []

	const hasLocation =
		typeof input.location === "string" &&
		input.location.trim().length > 0 &&
		input.location !== LOCATION_UNSPECIFIED
	if (!hasLocation) missing.push("location")

	const hasWindow =
		typeof input.opportunityWindow === "string" &&
		input.opportunityWindow.trim().length > 0 &&
		input.opportunityWindow !== WINDOW_UNSPECIFIED
	const hasDates = Boolean(input.begins || input.ends) || hasWindow
	if (!hasDates) missing.push("dates")

	if (!benefitAnswered(input.housingProvision, input.benefitEvidence?.housing)) {
		missing.push("housing")
	}
	if (!benefitAnswered(input.mealsProvision, input.benefitEvidence?.meals)) {
		missing.push("meals")
	}

	const payStated =
		input.benefitEvidence?.pay !== "not_stated" &&
		typeof input.payValue === "string" &&
		input.payValue.trim().length > 0
	if (!payStated) missing.push("pay")

	const answered = CARD_RECORD_FACTS.length - missing.length
	return {
		missing,
		completeness: Math.round((answered / CARD_RECORD_FACTS.length) * 100),
		reducedConfidence: missing.length >= REDUCED_CONFIDENCE_MISSING_COUNT,
	}
}

/**
 * "Missing: housing, meals & pay" — the card's one-line gap disclosure.
 * Returns null when nothing is missing, so the caller renders nothing at all
 * rather than a reassuring "complete!" badge nobody asked for.
 */
export function missingFactsSentence(
	missing: readonly CardRecordFact[],
): string | null {
	if (missing.length === 0) return null
	const labels = missing.map((fact) => CARD_RECORD_FACT_LABEL[fact])
	if (labels.length === 1) return `This host hasn't stated ${labels[0]}`
	const head = labels.slice(0, -1).join(", ")
	return `This host hasn't stated ${head} or ${labels[labels.length - 1]}`
}
