/**
 * Pure, deterministic listing-to-seeker match scoring.
 * No I/O, no ML, no side-effects. Safe to call server-side only.
 * Wave 10 / Agent B.
 */
/**
 * Listings scoring below this threshold are hidden from the /seek match feed.
 */
export const MATCH_SCORE_HIDE_THRESHOLD = 20;
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
export function scoreListingForSeeker(listing, seeker) {
    let score = 0;
    // +40 category match
    if (listing.category &&
        seeker.desiredCategories.includes(listing.category)) {
        score += 40;
    }
    // +20 housing alignment
    const hasHousing = listing.housingIncluded === true;
    if (seeker.housingPreference === "required" && hasHousing) {
        score += 20;
    }
    else if (seeker.housingPreference === "not_needed" && !hasHousing) {
        score += 20;
    }
    // +25 pay floor met (compare in major currency units)
    const payMin = seeker.payExpectationMin;
    if (payMin != null && payMin > 0 && listing.compensationMinCents != null) {
        const listingPayDollars = listing.compensationMinCents / 100;
        if (listingPayDollars >= payMin) {
            score += 25;
        }
    }
    // +15 location alignment
    if (seeker.locationPref === "remote") {
        if (listing.category === "remote") {
            score += 15;
        }
    }
    else if (seeker.locationPref != null) {
        // on_site or either: any listing with a location qualifies
        if (listing.locationDisplay != null &&
            listing.locationDisplay.trim().length > 0) {
            score += 15;
        }
    }
    return Math.min(100, score);
}
