// What a listing must state before it may be PUBLISHED (founder, 2026-07-17).
//
// THE RULE: a host-controlled listing may not go live while Housing, Meals or
// Pay is unanswered. Drafts may be incomplete — that is what a draft is for.
// But the moment a listing faces seekers, silence is not an option, and a blank
// field is NEVER read as "not included".
//
// WHY A SHARED MODULE. The form and the server must not be able to disagree
// about what "publishable" means. Today they can: ListingForm holds a
// client-only useMemo of validation rules and the server action has no
// counterpart, so the server would happily accept what the form rejects. This
// module is the one rule; both import it. Same reasoning as logistics.ts and
// categoryDepth.ts — the honesty-critical decision lives in one pure, tested
// place, and the UI only renders its result.
//
// THIS MODULE IS NOT THE ENFORCEMENT. It cannot be. Supabase's default table
// grants hand `authenticated` full-column UPDATE on `listings`, and
// listings_update_own carries no status predicate, so a host can PATCH
// status='live' straight through PostgREST and never execute a line of this
// file. Migration 070's listings_publication_triad_chk is the enforcement,
// because the database is the only layer on every writer's path. This module
// exists so the host is TOLD what is missing, in the form, before they try —
// and so the server can refuse with the same words rather than surfacing a
// raw 23514.

import type { BenefitProvision } from "./benefits";
import type { BenefitEvidenceStatus } from "./provenance";

/** A benefit the host has not answered yet. Ordered as the host meets them. */
export const PUBLICATION_FIELDS = ["housing", "meals", "pay"] as const;
export type PublicationField = (typeof PUBLICATION_FIELDS)[number];

export interface PublicationCandidate {
	/**
	 * Sourced listings are exempt (founder decision 4): they may keep showing
	 * "Not stated" until a verified host claims and confirms them. We must not
	 * force a decision onto a listing that has no host to make it.
	 */
	readonly provenance?: "verified" | "sourced";
	readonly housingEvidence?: BenefitEvidenceStatus;
	readonly mealsEvidence?: BenefitEvidenceStatus;
	readonly payEvidence?: BenefitEvidenceStatus;
	/** Pay needs a structured figure, not merely a decision that it exists. */
	readonly payMinCents?: number | null;
	readonly payMaxCents?: number | null;
}

export interface PublicationBlocker {
	readonly field: PublicationField;
	/** Why it blocks — the host-facing sentence. */
	readonly reason: string;
}

export type PublicationVerdict =
	| { readonly ok: true }
	| { readonly ok: false; readonly blockers: readonly PublicationBlocker[] };

const UNANSWERED: BenefitEvidenceStatus = "not_stated";

/**
 * Is this listing honest enough to face seekers?
 *
 * Returns every blocker at once, not the first: a host fixing one field at a
 * time and being told about the next one only after saving is a worse
 * experience than being told the truth up front.
 */
export function validateListingForPublication(
	candidate: PublicationCandidate,
): PublicationVerdict {
	// A sourced listing has no host to make the decision. Demanding one would
	// either block honest inventory or invite someone to invent an answer on a
	// stranger's behalf — which is the whole thing this rule exists to prevent.
	if (candidate.provenance === "sourced") return { ok: true };

	const blockers: PublicationBlocker[] = [];

	if ((candidate.housingEvidence ?? UNANSWERED) === UNANSWERED) {
		blockers.push({
			field: "housing",
			reason: "Say whether housing is included. Leaving it blank isn’t a “no” — seekers are told nobody answered.",
		});
	}
	if ((candidate.mealsEvidence ?? UNANSWERED) === UNANSWERED) {
		blockers.push({
			field: "meals",
			reason: "Say whether meals are included. Leaving it blank isn’t a “no”.",
		});
	}

	// Pay is different in kind: "pay exists" is not an answer a seeker can use.
	// The decision AND the figure are both required.
	if ((candidate.payEvidence ?? UNANSWERED) === UNANSWERED) {
		blockers.push({ field: "pay", reason: "Add what this role pays." });
	} else if (!hasPayFigure(candidate)) {
		blockers.push({
			field: "pay",
			reason: "Add a pay figure — a rate or a range, so seekers can tell if it works for them.",
		});
	}

	return blockers.length === 0 ? { ok: true } : { ok: false, blockers };
}

function hasPayFigure(candidate: PublicationCandidate): boolean {
	const min = candidate.payMinCents;
	const max = candidate.payMaxCents;
	return (typeof min === "number" && min > 0) || (typeof max === "number" && max > 0);
}

/** The evidence a host's explicit choice records: they said it themselves. */
export const HOST_CHOICE_EVIDENCE: BenefitEvidenceStatus = "confirmed";

/** How a benefit must READ on a card: offered, refused, or unanswered. */
export type BenefitCardState = "provided" | "not_provided" | "not_stated";

/**
 * What a seeker's card should SAY about a benefit.
 *
 * Found by driving the real UI: the discovery card computed this as
 * `provision !== "not_provided"`, which answered "included" for an unanswered
 * benefit AND for a missing field — silence rendering as a promise, on the
 * surface a seeker sees first, in the aria-label a screen reader announces.
 *
 * The rule is an ALLOW-LIST, deliberately. "Included" may only ever be said
 * about something a host actually said yes to, so a value nobody recognises —
 * including a provision added to the vocabulary years from now — falls back to
 * "not stated" rather than inventing a promise.
 *
 * Note this is a contract function, not a private helper in the component: the
 * same class of bug (a private, untestable inference) is what put "Not
 * included" on blank listings in the first place.
 */
export function benefitCardState(
	provision: BenefitProvision | undefined,
	evidence?: BenefitEvidenceStatus,
): BenefitCardState {
	// Either witness saying "nobody stated this" is decisive — a card must never
	// out-claim its own evidence.
	if (provision === undefined || provision === "not_stated" || evidence === "not_stated") {
		return "not_stated";
	}
	if (provision === "provided" || provision === "partial") return "provided";
	return "not_provided";
}

/**
 * What a host's choice means for the stored VALUE and its EVIDENCE, together.
 *
 * This lives here rather than beside the writer because it is the honesty rule
 * this whole change exists to enforce, and a rule nothing can test is a rule
 * that silently rots — the previous version of it lived as a private helper in
 * the query module and its inverse (a blank description meaning "not included")
 * shipped to production unnoticed.
 *
 * Value and evidence are returned as a PAIR because writing one without the
 * other is exactly how they drifted into a lie: the value said "no housing"
 * while the evidence said "an employer confirmed it".
 */
export function hostBenefitDecision(provision: BenefitProvision | undefined): {
	readonly included: boolean;
	readonly evidence: BenefitEvidenceStatus;
} {
	// No choice, or an explicitly unanswered one, is NOT a "no". The column
	// stays false because false is the only honest boolean when nobody has said
	// yes — but the evidence carries the truth that nobody spoke at all, and
	// that is what every surface renders from.
	if (provision === undefined || provision === "not_stated") {
		return { included: false, evidence: "not_stated" };
	}
	// An explicit "not included" is every bit as much a host decision as a yes,
	// and is recorded as confirmed — they told us themselves.
	return { included: provision !== "not_provided", evidence: HOST_CHOICE_EVIDENCE };
}
