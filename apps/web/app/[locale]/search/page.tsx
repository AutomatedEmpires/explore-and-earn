import type { Metadata } from "next";

import { optionalAuth } from "../../../lib/optionalAuth";

import type { SearchFilters } from "@explore-and-earn/db";
import type { CompensationUnit, MarketplaceCategory } from "@explore-and-earn/contracts";
import { MARKETPLACE_CATEGORIES } from "@explore-and-earn/contracts";

import {
	DISCOVERY_FIXTURES,
	type DiscoveryListing,
} from "../../../components/discovery";
import {
	canUseDiscoveryFixtureFallback,
	hasDiscoveryPublicDataConfig,
} from "../../../components/discovery/data";
import { getSearchDiscoveryListings } from "../../../components/search/data";
import { SearchView } from "../../../components/search/SearchView";
import { getSupabaseToken } from "../../../lib/serverCache";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	// The root template appends "| Explore & Earn" — don't bake it in twice.
	title: "Search seasonal jobs",
	description:
		"Search farm, maritime, remote, and seasonal work opportunities. Filter by category, housing, meals, pay, location, and dates.",
	alternates: { canonical: "/search" },
	robots: { index: true, follow: true },
};

// ─── URL param parsers ───────────────────────────────────────────────────────

function firstValue(value: string | string[] | undefined): string | undefined {
	const raw = Array.isArray(value) ? value[0] : value;
	const trimmed = raw?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function parseBoolean(value: string | string[] | undefined): boolean {
	const raw = firstValue(value);
	return raw === "1" || raw === "true" || raw === "on" || raw === "yes";
}

function parseCategory(
	value: string | string[] | undefined,
): MarketplaceCategory | undefined {
	const raw = firstValue(value);
	return raw && (MARKETPLACE_CATEGORIES as readonly string[]).includes(raw)
		? (raw as MarketplaceCategory)
		: undefined;
}

function parsePayMin(value: string | string[] | undefined): number | undefined {
	const raw = firstValue(value);
	if (!raw) return undefined;
	const parsed = Number(raw);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parsePayUnit(
	value: string | string[] | undefined,
): CompensationUnit | undefined {
	const raw = firstValue(value);
	return raw === "hour" || raw === "day" ? raw : undefined;
}

function parseDate(value: string | string[] | undefined): string | undefined {
	const raw = firstValue(value);
	return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : undefined;
}

// ─── Fixture fallback filtering (dev / preview) ──────────────────────────────
// Applies the same semantic filters as searchListings() but over the shared
// DISCOVERY_FIXTURES (the fixture set every other discovery surface uses).
// startDate filters are omitted because fixtures lack real dates; payUnit
// filtering is skipped because fixtures don't carry that field reliably.

function applyLocalFilters(
	fixtures: readonly DiscoveryListing[],
	opts: {
		query?: string;
		category?: MarketplaceCategory;
		housing?: boolean;
		meals?: boolean;
		payMin?: number;
		location?: string;
	},
): readonly DiscoveryListing[] {
	const query = opts.query?.trim().toLowerCase() ?? "";
	const location = opts.location?.trim().toLowerCase() ?? "";

	return fixtures.filter((listing) => {
		if (query) {
			const haystack =
				`${listing.title} ${listing.host.name} ${listing.location}`.toLowerCase();
			if (!haystack.includes(query)) return false;
		}

		if (opts.category && listing.category !== opts.category) return false;

		if (opts.housing && listing.benefits.housing.provision === "not_provided")
			return false;
		if (opts.meals && listing.benefits.meals.provision === "not_provided")
			return false;

		// payMin > 0 means "has real cash pay" — exclude work-exchange listings.
		if (opts.payMin != null && opts.payMin > 0) {
			if (listing.benefits.pay.provision === "not_provided") return false;
		}

		if (location && !listing.location.toLowerCase().includes(location))
			return false;

		return true;
	});
}

// ─── Page ────────────────────────────────────────────────────────────────────

type SearchPageParams = Record<string, string | string[] | undefined>;

export default async function SearchPage({
	searchParams,
}: {
	searchParams: Promise<SearchPageParams>;
}) {
	const params = await searchParams;

	const query = firstValue(params.q);
	const category = parseCategory(params.category);
	const housing = parseBoolean(params.housing);
	const meals = parseBoolean(params.meals);
	const payMin = parsePayMin(params.pay_min);
	const payUnit = parsePayUnit(params.pay_unit);
	const location = firstValue(params.location);
	const startAfter = parseDate(params.start_after);
	const startBefore = parseDate(params.start_before);

	let listings: readonly DiscoveryListing[];

	if (hasDiscoveryPublicDataConfig()) {
		// Server-side DB query — uses the search_vector GIN index (migration 022)
		// for the text path and indexed boolean/numeric columns for the rest.
		const filters: SearchFilters = {
			query,
			categories: category ? [category] : undefined,
			hasHousing: housing || undefined,
			hasMeals: meals || undefined,
			payMin,
			payUnit,
			location,
			startDateAfter: startAfter,
			startDateBefore: startBefore,
			limit: 48,
		};
		// Signed-in seekers get the SAME per-seeker truth as /seek — applied
		// HARD-exclusion, stored match pills (>=75), boosted/skipped enrichment,
		// and rankForSeeker ordering — via the shared assembly. Anonymous
		// visitors (or a failed auth read) keep the plain anon path, unchanged.
		const { userId } = await optionalAuth();
		const token = userId ? await getSupabaseToken() : null;
		listings = await getSearchDiscoveryListings(
			filters,
			userId && token ? { clerkToken: token, clerkUserId: userId } : undefined,
		);
	} else if (canUseDiscoveryFixtureFallback()) {
		// Dev / preview only: filter the shared discovery fixture set locally.
		// Never in prod — the else branch renders an honest empty state rather
		// than passing off invented listings as real.
		listings = applyLocalFilters(DISCOVERY_FIXTURES, {
			query,
			category,
			housing,
			meals,
			payMin,
			location,
		});
	} else {
		// Production with no public data config → honest empty state, no fixtures.
		listings = [];
	}

	return (
		<>
			<SearchView
				listings={listings}
				query={query}
				category={category}
				housing={housing}
				meals={meals}
				payMin={payMin}
				payUnit={payUnit}
				location={location}
				startAfter={startAfter}
				startBefore={startBefore}
			/>
		</>
	);
}
