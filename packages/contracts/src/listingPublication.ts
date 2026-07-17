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

import { HOST_BENEFIT_CHOICES, type BenefitProvision } from "./benefits";
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

/**
 * Has a HOST decided this, for a host-controlled listing?
 *
 * Only `confirmed` counts. `not_stated` is obviously silence — but `stated` is
 * a SOURCE's claim, and on a listing that now has a host it is still not the
 * host's answer. This is the claim seam: a sourced listing converts to
 * host-controlled while already live, and if `stated` satisfied the gate, a
 * claimed listing could stay published forever on an answer its new host never
 * gave. Founder decision 4 protects sourced listings until they are claimed —
 * it does not survive the claim.
 */
function hostDecided(evidence: BenefitEvidenceStatus | undefined): boolean {
	return evidence === HOST_CHOICE_EVIDENCE;
}

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

	if (!hostDecided(candidate.housingEvidence)) {
		blockers.push({
			field: "housing",
			reason: "Say whether housing is included. Leaving it blank isn’t a “no” — seekers are told nobody answered.",
		});
	}
	if (!hostDecided(candidate.mealsEvidence)) {
		blockers.push({
			field: "meals",
			reason: "Say whether meals are included. Leaving it blank isn’t a “no”.",
		});
	}

	// Pay is different in kind: "pay exists" is not an answer a seeker can use.
	// The decision AND the figure are both required.
	if (!hostDecided(candidate.payEvidence)) {
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

/**
 * Read a host's submitted benefit choice, as a TRUE tri-state.
 *
 * Absent     -> undefined; the writer leaves the column alone (the convention
 *               every other listing field follows: not submitted ≠ cleared).
 * ""         -> not_stated. The host saw the control and did not answer. This
 *               MUST survive to the writer — it is the state 070 refuses to
 *               publish, and collapsing it to undefined silently re-opens the
 *               hole this whole change closes.
 * A choice   -> theirs.
 * Anything else -> not_stated. We never guess a decision on a host's behalf.
 *
 * Lives here rather than in the action so the action and its tests exercise the
 * SAME function — a test that re-implements the parser stays green while the
 * parser rots.
 */
export function readBenefitChoice(raw: unknown): BenefitProvision | undefined {
	if (raw === undefined || raw === null) return undefined;
	if (typeof raw !== "string") return "not_stated";
	const trimmed = raw.trim();
	return (HOST_BENEFIT_CHOICES as readonly string[]).includes(trimmed)
		? (trimmed as BenefitProvision)
		: "not_stated";
}

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
	// Either witness saying "nobody stated this" is decisive — a card must never
	// out-claim its own evidence.
	if (provision === undefined || provision === "not_stated" || evidence === "not_stated") {
		return "not_stated";
	}
	if (provision === "provided" || provision === "partial") return "provided";
	if (provision === "not_provided") return "not_provided";
	// A value outside the vocabulary — dirty data, an unsafe cast, a member added
	// later. It is not a host decision, so it cannot become one in either
	// direction: falling through to "not_provided" would invent a NO exactly the
	// way the old code invented a YES.
	return "not_stated";
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
	// An explicit "not included" is every bit as much a host decision as a yes,
	// and is recorded as confirmed — they told us themselves.
	if (provision === "not_provided") {
		return { included: false, evidence: HOST_CHOICE_EVIDENCE };
	}
	if (provision === "provided" || provision === "partial") {
		return { included: true, evidence: HOST_CHOICE_EVIDENCE };
	}
	// Everything else — undefined, not_stated, or a value outside the vocabulary
	// — is the host not having chosen. An ALLOW-LIST, not `!== "not_provided"`:
	// that test recorded any unexpected value as a CONFIRMED YES, which is the
	// original bug wearing a different hat. The column stays false because false
	// is the only honest boolean when nobody said yes; the evidence carries the
	// truth that nobody spoke. Migration 070 refuses to publish such a row.
	return { included: false, evidence: "not_stated" };
}
