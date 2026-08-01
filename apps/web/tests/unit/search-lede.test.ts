import { describe, expect, it } from "vitest";

import {
	buildRemoveChips,
	buildSearchHref,
	composeSearchLede,
	countActiveFilters,
	type SearchQueryState,
} from "../../components/search/searchLede";

/**
 * /search voice + state contract (W4). The pins that matter:
 *
 *  1. TWO EMPTY WORLDS, never swapped. Zero results with no filters states the
 *     marketplace truth (nothing live yet); zero results WITH filters names
 *     the filters as the cause. The pre-W4 page told a visitor on the bare
 *     route to "try removing a filter" they had never applied — that exact
 *     defect must not return.
 *  2. Page-proved numbers only: the lede renders counts it was HANDED (the
 *     fetched page), never totals it invented.
 *  3. Removal chips: one per active axis, each href the same search minus
 *     exactly that axis — the URL is the state.
 */

describe("composeSearchLede", () => {
	it("zero results + zero filters states the marketplace truth, never blames filters", () => {
		const lede = composeSearchLede({
			resultCount: 0,
			matchesOnPage: 0,
			hasMorePages: false,
			activeFilterCount: 0,
		});
		expect(lede).toContain("nothing is live yet");
		expect(lede).toContain("housing, meals, and pay up front");
		// The pre-W4 defect: filter-blaming copy on the virgin route.
		expect(lede.toLowerCase()).not.toContain("filter");
	});

	it("a faulted read is its own truth — never 'no listings', never filter-blame", () => {
		const lede = composeSearchLede({
			resultCount: 0,
			matchesOnPage: 0,
			hasMorePages: false,
			activeFilterCount: 3,
			readFailed: true,
		});
		expect(lede).toContain("couldn't be read");
		expect(lede.toLowerCase()).not.toContain("nothing is live yet");
		expect(lede.toLowerCase()).not.toContain("drop a filter");
	});

	it("zero results + active filters names the filters as the cause", () => {
		const lede = composeSearchLede({
			resultCount: 0,
			matchesOnPage: 0,
			hasMorePages: false,
			activeFilterCount: 2,
		});
		expect(lede.toLowerCase()).toContain("filter");
		expect(lede.toLowerCase()).not.toContain("nothing is live yet");
	});

	it("renders exactly the handed page count with singular/plural nouns", () => {
		expect(
			composeSearchLede({
				resultCount: 1,
				matchesOnPage: 0,
				hasMorePages: false,
				activeFilterCount: 0,
			}),
		).toContain("Showing 1 open role");
		expect(
			composeSearchLede({
				resultCount: 12,
				matchesOnPage: 0,
				hasMorePages: false,
				activeFilterCount: 3,
			}),
		).toContain("Showing 12 open roles");
	});

	it("claims more pages only when the look-ahead proved one", () => {
		const withMore = composeSearchLede({
			resultCount: 48,
			matchesOnPage: 0,
			hasMorePages: true,
			activeFilterCount: 0,
		});
		const lastPage = composeSearchLede({
			resultCount: 5,
			matchesOnPage: 0,
			hasMorePages: false,
			activeFilterCount: 0,
		});
		expect(withMore).toContain("more pages after this one");
		expect(lastPage).not.toContain("more pages");
	});

	it("names the stamped match count only when it is nonzero", () => {
		expect(
			composeSearchLede({
				resultCount: 10,
				matchesOnPage: 4,
				hasMorePages: false,
				activeFilterCount: 0,
			}),
		).toContain("4 match your profile");
		expect(
			composeSearchLede({
				resultCount: 10,
				matchesOnPage: 0,
				hasMorePages: false,
				activeFilterCount: 0,
			}),
		).not.toContain("match your profile");
	});
});

describe("countActiveFilters", () => {
	it("counts every active axis, including the query", () => {
		expect(countActiveFilters({})).toBe(0);
		expect(countActiveFilters({ query: "deckhand" })).toBe(1);
		expect(
			countActiveFilters({
				query: "deckhand",
				category: "maritime",
				housing: true,
				meals: true,
				visa: true,
				startRangeMonths: 3,
				payMin: 20,
				payUnit: "hour",
				location: "Alaska",
				startAfter: "2026-09-01",
				startBefore: "2026-12-01",
			}),
		).toBe(11);
	});
});

describe("buildSearchHref", () => {
	it("bare state yields the bare route", () => {
		expect(buildSearchHref({})).toBe("/search");
	});

	it("round-trips every axis and omits page 1", () => {
		const state: SearchQueryState = {
			query: "deckhand",
			category: "maritime",
			housing: true,
			visa: true,
			startRangeMonths: 3,
			payMin: 20,
			payUnit: "hour",
			location: "Alaska",
		};
		const href = buildSearchHref(state);
		expect(href).toContain("q=deckhand");
		expect(href).toContain("category=maritime");
		expect(href).toContain("housing=1");
		expect(href).toContain("visa=1");
		expect(href).toContain("start_range=3");
		expect(href).toContain("pay_min=20");
		expect(href).toContain("pay_unit=hour");
		expect(href).toContain("location=Alaska");
		expect(href).not.toContain("page=");
		expect(buildSearchHref(state, { page: 1 })).not.toContain("page=");
		expect(buildSearchHref(state, { page: 2 })).toContain("page=2");
	});

	it("an override can drop a single axis", () => {
		const href = buildSearchHref(
			{ query: "deckhand", category: "maritime" },
			{ category: undefined },
		);
		expect(href).toContain("q=deckhand");
		expect(href).not.toContain("category=");
	});
});

describe("buildRemoveChips", () => {
	it("emits one chip per active axis, each dropping exactly that axis", () => {
		const state: SearchQueryState = {
			query: "deckhand",
			category: "maritime",
			housing: true,
			visa: true,
		};
		const chips = buildRemoveChips(state);
		expect(chips).toHaveLength(4);

		const byLabel = new Map(chips.map((chip) => [chip.label, chip.href]));
		expect(byLabel.get("“deckhand”")).not.toContain("q=");
		expect(byLabel.get("“deckhand”")).toContain("category=maritime");
		expect(byLabel.get("Maritime")).not.toContain("category=");
		expect(byLabel.get("Maritime")).toContain("q=deckhand");
		expect(byLabel.get("Housing")).not.toContain("housing=");
		expect(byLabel.get("Visa support")).not.toContain("visa=");
	});

	it("emits nothing for a bare state", () => {
		expect(buildRemoveChips({})).toHaveLength(0);
	});
});
