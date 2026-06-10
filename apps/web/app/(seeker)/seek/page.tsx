import type { Metadata } from "next";

import {
	type SearchFilters,
	rowToDiscoveryFields,
	searchListings,
} from "@explore-and-earn/db";
import {
	type CompensationUnit,
	MARKETPLACE_CATEGORIES,
} from "@explore-and-earn/contracts";

import {
	DISCOVERY_FIXTURES,
	type DiscoveryListing,
} from "../../../components/discovery";
import {
	canUseDiscoveryFixtureFallback,
	hasDiscoveryPublicDataConfig,
	warnIfDiscoveryDataMissingInProduction,
} from "../../../components/discovery/data";
import { SeekBrowser } from "../../../components/seeker";
import { buildFeaturedEmployers } from "../../../lib/employer-utils";

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

function parseStartRange(
	value: string | string[] | undefined,
): 1 | 3 | 6 | undefined {
	const raw = firstValue(value);
	if (raw === "1" || raw === "3" || raw === "6") {
		return Number(raw) as 1 | 3 | 6;
	}
	return undefined;
}

function parsePayUnit(
	value: string | string[] | undefined,
): CompensationUnit | undefined {
	const raw = firstValue(value);
	return raw === "hour" || raw === "day" ? raw : undefined;
}

function parseCategory(
	value: string | string[] | undefined,
): string | undefined {
	const raw = firstValue(value);
	return raw && (MARKETPLACE_CATEGORIES as readonly string[]).includes(raw)
		? raw
		: undefined;
}

function beginsWithinRange(
	listing: DiscoveryListing,
	startRangeMonths: 1 | 3 | 6 | undefined,
): boolean {
	if (!startRangeMonths) {
		return true;
	}

	if (!listing.begins) {
		return false;
	}

	const beginsDate = new Date(listing.begins);
	if (Number.isNaN(beginsDate.getTime())) {
		return false;
	}

	const now = new Date();
	now.setHours(0, 0, 0, 0);
	const cutoff = new Date(now);
	cutoff.setMonth(cutoff.getMonth() + startRangeMonths);
	return beginsDate >= now && beginsDate <= cutoff;
}

function matchesLocalFilters(
	listing: DiscoveryListing,
	filters: SearchFilters,
): boolean {
	const query = filters.query?.toLowerCase().trim();
	if (query) {
		const haystack = [listing.title, listing.location, listing.host.name]
			.join(" ")
			.toLowerCase();
		if (!haystack.includes(query)) {
			return false;
		}
	}

	if (filters.categories?.length && !filters.categories.includes(listing.category)) {
		return false;
	}

	if (filters.hasHousing && listing.benefits.housing.provision === "not_provided") {
		return false;
	}

	if (filters.hasMeals && listing.benefits.meals.provision === "not_provided") {
		return false;
	}

	if (filters.visaSupport && !listing.visaSupport) {
		return false;
	}

	if (filters.payUnit && listing.payInsight?.unit !== filters.payUnit) {
		return false;
	}

	if (
		filters.payMin != null &&
		Number.isFinite(filters.payMin) &&
		filters.payMin > 0
	) {
		const min = listing.payInsight?.minCents;
		if (min == null || min < Math.round(filters.payMin * 100)) {
			return false;
		}
	}

	if (
		filters.location &&
		!listing.location.toLowerCase().includes(filters.location.toLowerCase())
	) {
		return false;
	}

	return beginsWithinRange(listing, filters.startRangeMonths);
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
	const visaSupport = parseBoolean(params.visa);
	const startRangeMonths = parseStartRange(params.start_range);
	const payMin = parsePayMin(params.pay_min);
	const payUnit = parsePayUnit(params.pay_unit);
	const location = firstValue(params.location);

	const filters: SearchFilters = {
		query,
		categories: category ? [category] : undefined,
		hasHousing: housing,
		hasMeals: meals,
		visaSupport,
		startRangeMonths,
		payMin,
		payUnit,
		location,
	};
	const hasPublicDataConfig = hasDiscoveryPublicDataConfig();
	const canUseFixtures = canUseDiscoveryFixtureFallback();

	const listings = hasPublicDataConfig
		? (await searchListings(filters)).map(
				(row) => rowToDiscoveryFields(row) as DiscoveryListing,
			)
		: canUseFixtures
			? DISCOVERY_FIXTURES.filter((listing) => matchesLocalFilters(listing, filters))
			: (warnIfDiscoveryDataMissingInProduction("seek/page"), []);

	// Featured employers are always built from the full fixture set so the
	// promotional rail is populated regardless of active search filters.
	// TODO(paid-boost): replace with getFeaturedEmployers() against a boost table.
	const featuredEmployers = buildFeaturedEmployers(DISCOVERY_FIXTURES);

	return (
		<SeekBrowser
			listings={listings}
			featuredEmployers={featuredEmployers}
			query={query}
			category={category}
			housing={housing}
			meals={meals}
			visaSupport={visaSupport}
			startRangeMonths={startRangeMonths}
			location={location}
			payMin={payMin}
			payUnit={payUnit}
		/>
	);
}
