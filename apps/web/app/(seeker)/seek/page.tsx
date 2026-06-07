import type { Metadata } from "next";

import {
	type SearchFilters,
	rowToDiscoveryFields,
	searchListings,
} from "@explore-and-earn/db";
import { MARKETPLACE_CATEGORIES } from "@explore-and-earn/contracts";

import type { DiscoveryListing } from "../../../components/discovery";
import { SeekBrowser } from "../../../components/seeker";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	title: "Seek",
};

type SeekSearchParams = {
	[key: string]: string | string[] | undefined;
};

function firstValue(value: string | string[] | undefined): string | undefined {
	const raw = Array.isArray(value) ? value[0] : value;
	const trimmed = raw?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function parseBoolean(value: string | string[] | undefined): boolean {
	const raw = firstValue(value);
	return raw === "1" || raw === "true" || raw === "on" || raw === "yes";
}

function parsePayMin(value: string | string[] | undefined): number | undefined {
	const raw = firstValue(value);
	if (!raw) return undefined;
	const parsed = Number(raw);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseCategory(
	value: string | string[] | undefined,
): string | undefined {
	const raw = firstValue(value);
	return raw && (MARKETPLACE_CATEGORIES as readonly string[]).includes(raw)
		? raw
		: undefined;
}

/**
 * Seek \u2014 the seeker-scope opportunity feed, now backed by a real server-side
 * search. All filter state lives in the URL query (q / category / housing /
 * meals / pay_min / location) so a filtered view is shareable, bookmarkable,
 * and re-rendered on the server. This page parses the URL into SearchFilters,
 * runs searchListings against live listings, and maps the rows into the
 * DiscoveryListing view-model; SeekBrowser renders the controls + the canonical
 * DiscoveryCard grid and drives the URL.
 */
export default async function SeekPage({
	searchParams,
}: {
	searchParams: Promise<SeekSearchParams>;
}) {
	const params = await searchParams;

	const query = firstValue(params.q);
	const category = parseCategory(params.category);
	const housing = parseBoolean(params.housing);
	const meals = parseBoolean(params.meals);
	const payMin = parsePayMin(params.pay_min);
	const location = firstValue(params.location);

	const filters: SearchFilters = {
		query,
		categories: category ? [category] : undefined,
		hasHousing: housing,
		hasMeals: meals,
		payMin,
		location,
	};

	const rows = await searchListings(filters);
	const listings = rows.map(
		(row) => rowToDiscoveryFields(row) as DiscoveryListing,
	);

	return (
		<SeekBrowser
			listings={listings}
			query={query}
			category={category}
			housing={housing}
			meals={meals}
			location={location}
			payMin={payMin}
		/>
	);
}
