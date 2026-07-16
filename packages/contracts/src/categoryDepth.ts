// Category depth — the facts that only matter for ONE lane.
//
// Logistics (068) is row-level: every listing has internet-or-not. But "how
// long is the boat, and do you sleep on it?" is meaningless on a farm listing.
// Those questions are category-scoped, and this is their home:
// `listings.category_depth` (migration 069), keyed by the listing's category.
//
// HONESTY MODEL — identical to logistics, and for the same reason. Every field
// carries exactly three states, enforced by the type system:
//
//   * key ABSENT    → the host never stated it. Render NOT_STATED_LABEL. Never
//                     infer it, never default it, never rank or reason over it.
//   * key = false   → the host explicitly said NO. Materially different from
//                     absence, and a seeker must be able to tell them apart.
//   * key = value   → the host stated it.
//
// There is deliberately no `unknown`/`not_stated` sentinel VALUE: a sentinel
// invites writing it, and a written sentinel is indistinguishable from a real
// answer at the DB level. Absence cannot be faked.
//
// WHY A SEPARATE COLUMN FROM `logistics` — see 069's header. Short version:
// each group carries its own host-reported date, and 068's writer stamps a
// fresh date only when the stated facts change. Sharing one blob would let an
// edit to the vessel length stamp a fresh CONNECTIVITY date, claiming the host
// re-confirmed an internet speed they never touched.
//
// NOT A MATCHING INPUT, BY CONSTRUCTION. This shape is as unfilterable as any
// jsonb. Migration 051 exists because match-critical facts were promoted OUT of
// exactly this kind of blob into typed, indexed columns so they could actually
// be computed and filtered. That rule stands: a category fact that must be
// matched, filtered, or ranked GRADUATES to a typed column. Nothing here feeds
// the match engine — and maritime's match-critical facts (licences, tickets)
// already live in `listings.required_certifications` where they belong.
//
// SCOPE: maritime only, for now. The shape is keyed by category precisely so
// the second lane is additive. Shipping four guesses about what farm, seasonal
// and remote hosts know would be four times the surface and four times the
// chance of asking a question no host can answer. One lane, then learn.

import {
	hostReportFreshness,
	optionalBoolean,
	optionalIsoDate,
	optionalMember,
	optionalPositiveInteger,
	optionalPositiveNumber,
	type HostReportFreshness,
} from "./hostReport";

/* ---------------------------------------------------------------- maritime */

/**
 * What kind of vessel this is. Chosen because each carries a materially
 * different lived reality — a tall ship berth and a motor-yacht cabin are not
 * the same job, the same space, or the same motion at sea.
 */
export const VESSEL_TYPES = [
	"sailing_yacht",
	"motor_yacht",
	"tall_ship",
	"fishing_vessel",
	"charter_boat",
	"workboat",
	"liveaboard",
] as const;
export type VesselType = (typeof VESSEL_TYPES)[number];

/** Whether a berth aboard is yours alone or shared with other crew. */
export const BERTH_TYPES = ["private_cabin", "shared_cabin", "bunk_shared"] as const;
export type BerthType = (typeof BERTH_TYPES)[number];

/** A vessel longer than this is a ship, not a listing on this marketplace. */
const MAX_PLAUSIBLE_LENGTH_FEET = 1_000;
/** Crew beyond this is not the kind of berth a seeker is taking. */
const MAX_PLAUSIBLE_CREW = 500;

/**
 * Maritime depth — what a seeker needs to know about the vessel itself.
 *
 * Every field is optional because every field is genuinely answerable-or-not:
 * a host listing a day-charter deckhand role may know the vessel cold and have
 * no idea about crew size next season.
 */
export interface MaritimeDepth {
	readonly vesselType?: VesselType;
	/** Overall length in feet. A rough figure — rendered as approximate. */
	readonly lengthFeet?: number;
	/**
	 * Whether the crew sleeps aboard.
	 *
	 * The single most decision-changing maritime fact, and one a seeker cannot
	 * infer from anything else on the listing: it silently decides whether they
	 * need to find and pay for housing in a marina town. `false` is a real,
	 * useful answer ("you do not sleep aboard") and is NOT the same fact as
	 * silence — which is exactly why it is a tri-state and not a checkbox.
	 */
	readonly berthAboard?: boolean;
	/** Berth privacy. Incoherent if the crew does not sleep aboard at all. */
	readonly berthType?: BerthType;
	/** Total crew aboard, including the seeker. */
	readonly crewSize?: number;
	/**
	 * When the host last stated these facts. Absent = they never dated it, which
	 * is unknown age — NOT fresh. Stamped only when the stated facts change (see
	 * statedFactsKey), so an unrelated edit never fakes a re-confirmation.
	 */
	readonly reportedAt?: string;
}

/** The `listings.category_depth` JSONB shape (migration 069). */
export interface ListingCategoryDepth {
	readonly maritime?: MaritimeDepth;
}

/* -------------------------------------------------------------- freshness */

export type CategoryDepthFreshness = HostReportFreshness;

/** Freshness of a category-depth report. Derived at read; never stored. */
export const categoryDepthFreshness = hostReportFreshness;

/* ------------------------------------------------------------- sanitizing */

/**
 * Coerce untrusted input (host form, persisted jsonb, a hand-written SQL
 * update) into a MaritimeDepth, DROPPING every key it cannot vouch for.
 *
 * Dropping is the honest failure mode: an unparseable value becomes absence,
 * which renders "Not stated" — never a guess, never a clamp to a number nobody
 * said. Returns undefined when nothing survived, so an empty object is never
 * persisted as though the host had answered.
 */
export function sanitizeMaritimeDepth(value: unknown): MaritimeDepth | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const v = value as Record<string, unknown>;

	const out: Record<string, unknown> = {};

	const vesselType = optionalMember(v.vesselType, VESSEL_TYPES);
	if (vesselType !== undefined) out.vesselType = vesselType;

	const lengthFeet = optionalPositiveNumber(v.lengthFeet, MAX_PLAUSIBLE_LENGTH_FEET, 1);
	if (lengthFeet !== undefined) out.lengthFeet = lengthFeet;

	const berthAboard = optionalBoolean(v.berthAboard);
	if (berthAboard !== undefined) out.berthAboard = berthAboard;

	// Berth privacy DESCRIBES a berth, so it is incoherent when the host has
	// explicitly said the crew does not sleep aboard. Dropping it here means a
	// listing can never say "you don't sleep aboard" and "private cabin" at
	// once. Note this drops only against an explicit `false` — if the host never
	// answered berthAboard, a stated berthType is still their own claim and
	// survives.
	if (berthAboard !== false) {
		const berthType = optionalMember(v.berthType, BERTH_TYPES);
		if (berthType !== undefined) out.berthType = berthType;
	}

	const crewSize = optionalPositiveInteger(v.crewSize, MAX_PLAUSIBLE_CREW);
	if (crewSize !== undefined) out.crewSize = crewSize;

	// A date with no facts is not a report — it would render a freshness note
	// about nothing. Checked BEFORE the date is added so the date cannot make an
	// empty report look like an answer.
	if (Object.keys(out).length === 0) return undefined;

	const reportedAt = optionalIsoDate(v.reportedAt);
	if (reportedAt !== undefined) out.reportedAt = reportedAt;

	return out as MaritimeDepth;
}

/**
 * Coerce untrusted input into a ListingCategoryDepth.
 *
 * Applied on the way OUT of the database as well as in: the jsonb column is
 * where a hand-written SQL update or a contract that narrows later could leave
 * a shape this code would otherwise render as a host's claim.
 */
export function sanitizeCategoryDepth(value: unknown): ListingCategoryDepth {
	if (typeof value !== "object" || value === null) return {};
	const v = value as Record<string, unknown>;
	const maritime = sanitizeMaritimeDepth(v.maritime);
	return maritime ? { maritime } : {};
}

/**
 * True when the host actually stated at least one category fact.
 *
 * The gate for rendering the section at all: a depth object carrying only a
 * `reportedAt` states nothing, and a section that rendered for it would be an
 * empty claim. sanitizeMaritimeDepth already refuses to build that shape, so
 * this is the second line of defence, not the first.
 */
export function hasCategoryDepth(depth: ListingCategoryDepth | undefined): boolean {
	if (!depth?.maritime) return false;
	return Object.keys(depth.maritime).some((key) => key !== "reportedAt");
}
