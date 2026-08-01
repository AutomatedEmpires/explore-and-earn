import type {
	CompensationUnit,
	MarketplaceCategory,
} from "@explore-and-earn/contracts";

/**
 * /search state + voice — pure functions over the page's URL state and the
 * rows it actually fetched, so the written lede, the removal chips, and the
 * pagination hrefs can never disagree with the results underneath them.
 *
 * The honesty contract, applied to a search page:
 *   - The lede claims only page-proved facts: the fetched row count, the
 *     stamped match count, and the more-pages flag. No global totals — the
 *     server never fetched one.
 *   - Zero results has TWO distinct truths and they must never swap: with
 *     filters active, the filters screened everything out (recoverable —
 *     name the cause, offer per-filter removal); with none active, the
 *     marketplace simply has no live listings yet (say that plainly).
 */

export interface SearchQueryState {
	readonly query?: string;
	readonly category?: MarketplaceCategory;
	readonly housing?: boolean;
	readonly meals?: boolean;
	readonly visa?: boolean;
	readonly startRangeMonths?: 1 | 3 | 6;
	readonly payMin?: number;
	readonly payUnit?: CompensationUnit;
	readonly location?: string;
	readonly startAfter?: string;
	readonly startBefore?: string;
}

export const SEARCH_CATEGORY_LABELS: Record<MarketplaceCategory, string> = {
	farm: "Farm",
	maritime: "Maritime",
	remote: "Remote",
	seasonal: "Seasonal",
	mix: "Mix",
};

/** Build a canonical /search href from state (+ overrides). Page 1 omits ?page. */
export function buildSearchHref(
	state: SearchQueryState,
	overrides?: Partial<SearchQueryState> & { readonly page?: number },
): string {
	const merged = { ...state, ...overrides };
	const sp = new URLSearchParams();
	if (merged.query) sp.set("q", merged.query);
	if (merged.category) sp.set("category", merged.category);
	if (merged.housing) sp.set("housing", "1");
	if (merged.meals) sp.set("meals", "1");
	if (merged.visa) sp.set("visa", "1");
	if (merged.startRangeMonths)
		sp.set("start_range", String(merged.startRangeMonths));
	if (merged.payMin != null) sp.set("pay_min", String(merged.payMin));
	if (merged.payUnit) sp.set("pay_unit", merged.payUnit);
	if (merged.location) sp.set("location", merged.location);
	if (merged.startAfter) sp.set("start_after", merged.startAfter);
	if (merged.startBefore) sp.set("start_before", merged.startBefore);
	if (overrides?.page != null && overrides.page > 1)
		sp.set("page", String(overrides.page));
	const qs = sp.toString();
	return qs ? `/search?${qs}` : "/search";
}

/** How many filter axes are active (the query counts — it screens rows out). */
export function countActiveFilters(state: SearchQueryState): number {
	let n = 0;
	if (state.query) n += 1;
	if (state.category) n += 1;
	if (state.housing) n += 1;
	if (state.meals) n += 1;
	if (state.visa) n += 1;
	if (state.startRangeMonths) n += 1;
	if (state.payMin != null) n += 1;
	if (state.payUnit) n += 1;
	if (state.location) n += 1;
	if (state.startAfter) n += 1;
	if (state.startBefore) n += 1;
	return n;
}

export interface SearchLedeInput {
	/** Rows actually fetched for THIS page. */
	readonly resultCount: number;
	/** Rows on this page carrying a stamped match score (signed-in only). */
	readonly matchesOnPage: number;
	/** The limit+1 look-ahead said another page exists. */
	readonly hasMorePages: boolean;
	/** countActiveFilters(state) at render time. */
	readonly activeFilterCount: number;
	/**
	 * The marketplace read FAULTED (network, database). A failed read is a
	 * third truth — never dressed up as "no listings" (a lie during an outage)
	 * and never a page-wide crash (the read degrades its own section).
	 */
	readonly readFailed?: boolean;
}

/**
 * The header's written line. Same discipline as /seek's lede (W3): every
 * number is a fact this page fetched; the triad promise is the card contract
 * itself; no invented totals, no invented activity.
 */
export function composeSearchLede(input: SearchLedeInput): string {
	const { resultCount, matchesOnPage, hasMorePages, activeFilterCount } = input;
	if (input.readFailed) {
		return "The marketplace couldn't be read just now — refresh in a moment to try again.";
	}
	if (resultCount === 0) {
		return activeFilterCount > 0
			? "Nothing matches this search yet — drop a filter below and the roles come back."
			: "The marketplace opens with its first listing — nothing is live yet, and every role that arrives states housing, meals, and pay up front.";
	}
	const roleNoun = resultCount === 1 ? "open role" : "open roles";
	const pages = hasMorePages ? ", with more pages after this one" : "";
	return matchesOnPage > 0
		? `Showing ${resultCount} ${roleNoun}${pages} — ${matchesOnPage} match your profile, and every card states housing, meals, and pay up front.`
		: `Showing ${resultCount} ${roleNoun}${pages} — every card states housing, meals, and pay up front.`;
}

export interface RemoveChip {
	readonly label: string;
	readonly href: string;
	readonly icon?: string;
}

/**
 * One recovery chip per active filter axis; each href is the SAME search with
 * that one axis dropped. Plain links, no client state — the URL is the state.
 */
export function buildRemoveChips(state: SearchQueryState): RemoveChip[] {
	const chips: RemoveChip[] = [];
	if (state.query)
		chips.push({
			label: `“${state.query}”`,
			href: buildSearchHref(state, { query: undefined }),
		});
	if (state.category)
		chips.push({
			label: SEARCH_CATEGORY_LABELS[state.category],
			href: buildSearchHref(state, { category: undefined }),
			icon: `category.${state.category}`,
		});
	if (state.housing)
		chips.push({
			label: "Housing",
			href: buildSearchHref(state, { housing: undefined }),
			icon: "benefit.housing",
		});
	if (state.meals)
		chips.push({
			label: "Meals",
			href: buildSearchHref(state, { meals: undefined }),
			icon: "benefit.meals",
		});
	if (state.visa)
		chips.push({
			label: "Visa support",
			href: buildSearchHref(state, { visa: undefined }),
		});
	if (state.startRangeMonths)
		chips.push({
			label:
				state.startRangeMonths === 1
					? "Begins within 1 month"
					: `Begins within ${state.startRangeMonths} months`,
			href: buildSearchHref(state, { startRangeMonths: undefined }),
		});
	if (state.payMin != null)
		chips.push({
			label: "Pay floor",
			href: buildSearchHref(state, { payMin: undefined }),
		});
	if (state.payUnit)
		chips.push({
			label: state.payUnit === "hour" ? "Paid per hour" : "Paid per day",
			href: buildSearchHref(state, { payUnit: undefined }),
		});
	if (state.location)
		chips.push({
			label: state.location,
			href: buildSearchHref(state, { location: undefined }),
		});
	if (state.startAfter)
		chips.push({
			label: "Starts after",
			href: buildSearchHref(state, { startAfter: undefined }),
		});
	if (state.startBefore)
		chips.push({
			label: "Starts before",
			href: buildSearchHref(state, { startBefore: undefined }),
		});
	return chips;
}
