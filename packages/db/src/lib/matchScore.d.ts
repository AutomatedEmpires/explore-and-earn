/**
 * Pure, deterministic listing-to-seeker match scoring.
 * No I/O, no ML, no side-effects. Safe to call server-side only.
 * Wave 10 / Agent B.
 */
/** Listing fields required for scoring. */
export interface ScorableListing {
    readonly category: string;
    readonly housingIncluded: boolean;
    readonly compensationMinCents: number | null;
    readonly locationDisplay: string | null;
}
/** Seeker profile fields required for scoring. */
export interface ScorableSeekerProfile {
    readonly desiredCategories: readonly string[];
    readonly housingPreference: string | null;
    readonly locationPref: string | null;
    /**
     * Seeker's minimum pay expectation in MAJOR currency units (e.g. dollars).
     * Optional: the +25 pay rule is skipped when absent or zero.
     */
    readonly payExpectationMin?: number | null;
}
/**
 * Listings scoring below this threshold are hidden from the /seek match feed.
 */
export declare const MATCH_SCORE_HIDE_THRESHOLD = 20;
/**
 * Compute a 0-100 match score for a listing against a seeker profile.
 *
 * Additive scoring:
 *   +40  listing.category in seeker.desiredCategories
 *   +20  housing alignment (required & included, or not_needed & not included)
 *   +25  listing pay floor >= seeker pay expectation (major currency units)
 *   +15  location alignment (remote pref -> remote category; else any location)
 *
 * Capped at 100.
 */
export declare function scoreListingForSeeker(listing: ScorableListing, seeker: ScorableSeekerProfile): number;
