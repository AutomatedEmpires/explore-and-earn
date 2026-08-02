/**
 * The hero's written lede — a pure function over real listing state, so the
 * sentence and the page below it can never disagree (the W1-W3 Basecamp
 * discipline applied to the detail hero).
 *
 * Honesty rules:
 *   - Every clause exists only when its fact does: no host → no host clause,
 *     no stated window → no date claim (never "Ongoing", never a guess).
 *   - The closing promise ("housing, meals, and pay are answered below") is
 *     the page's structural contract — the deal section always renders all
 *     three answers, including "Not stated" — so the sentence is true by
 *     construction, not by copywriting.
 */

export interface ListingLedeInput {
	/** Human lane label ("Farm", "Maritime", …). */
	readonly categoryLabel: string;
	/** Host company name, or null (sourced listings carry no host block). */
	readonly hostName: string | null;
	/** Human location line, or null when unstated. */
	readonly locationDisplay: string | null;
	/** Human season window ("Jun 2026 – Sep 2026"), or null when unstated. */
	readonly dateLabel: string | null;
}

export function composeListingLede(input: ListingLedeInput): string {
	const { categoryLabel, hostName, locationDisplay, dateLabel } = input;

	let opener = `${categoryLabel} work`;
	if (hostName) opener += ` with ${hostName}`;
	if (locationDisplay) opener += ` in ${locationDisplay}`;
	if (dateLabel) opener += ` — ${dateLabel}`;

	return `${opener}. Housing, meals, and pay are answered below, before you apply.`;
}
