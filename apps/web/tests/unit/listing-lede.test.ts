import { describe, expect, it } from "vitest";

import { composeListingLede } from "../../components/listing/listingLede";

/**
 * The detail hero's written lede (W5). Pins:
 *  1. Clause-per-fact — a clause exists only when its fact does; a null date
 *     produces NO date text (no date → no claim), a null host no host clause.
 *  2. The closing triad promise is always present — it states the page's
 *     structural contract (the deal section renders all three answers,
 *     including "Not stated"), which is true by construction.
 */

describe("composeListingLede", () => {
	it("full state composes every clause in order", () => {
		expect(
			composeListingLede({
				categoryLabel: "Farm",
				hostName: "Cascade Bloom Orchards",
				locationDisplay: "Wenatchee, WA",
				dateLabel: "Jun 2026 – Sep 2026",
			}),
		).toBe(
			"Farm work with Cascade Bloom Orchards in Wenatchee, WA — Jun 2026 – Sep 2026. Housing, meals, and pay are answered below, before you apply.",
		);
	});

	it("no stated window means no date text at all", () => {
		const lede = composeListingLede({
			categoryLabel: "Maritime",
			hostName: "Saltline Crews",
			locationDisplay: "Kodiak, AK",
			dateLabel: null,
		});
		expect(lede).toBe(
			"Maritime work with Saltline Crews in Kodiak, AK. Housing, meals, and pay are answered below, before you apply.",
		);
		expect(lede).not.toContain("—");
	});

	it("a hostless (sourced) listing carries no host clause", () => {
		expect(
			composeListingLede({
				categoryLabel: "Seasonal",
				hostName: null,
				locationDisplay: "Jackson, WY",
				dateLabel: "Starting Dec 2026",
			}),
		).toBe(
			"Seasonal work in Jackson, WY — Starting Dec 2026. Housing, meals, and pay are answered below, before you apply.",
		);
	});

	it("bare category still forms a true sentence with the triad promise", () => {
		expect(
			composeListingLede({
				categoryLabel: "Remote",
				hostName: null,
				locationDisplay: null,
				dateLabel: null,
			}),
		).toBe(
			"Remote work. Housing, meals, and pay are answered below, before you apply.",
		);
	});
});
