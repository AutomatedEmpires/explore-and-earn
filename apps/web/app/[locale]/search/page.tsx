import type { Metadata } from "next";

import { optionalAuth } from "../../../lib/optionalAuth";

import type { ListingRow, SearchFilters } from "@explore-and-earn/db";
import {
	rowToDiscoveryFields,
	scoreSeekerListingRow,
	searchListings,
	seekerHasMatchInputs,
} from "@explore-and-earn/db";
import type { CompensationUnit, MarketplaceCategory } from "@explore-and-earn/contracts";
import { MARKETPLACE_CATEGORIES, matchBandFor } from "@explore-and-earn/contracts";

import type { SearchListing } from "../../../components/search/listing";
import { SEARCH_FIXTURES } from "../../../components/search/fixtures";
import { SearchView } from "../../../components/search/SearchView";
import { cachedSeekerProfile, getSupabaseToken } from "../../../lib/serverCache";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	// The root template appends "| Explore & Earn" — don't bake it in twice.
	title: "Search seasonal jobs",
	description:
		"Search farm, maritime, remote, and seasonal work opportunities. Filter by category, housing, meals, pay, location, and dates.",
	alternates: { canonical: "/search" },
	robots: { index: true, follow: true },
};

// ─── env check (same pattern as discovery/data.ts) ──────────────────────────
const hasPublicDataConfig =
	Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
	Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Fixtures are a DEV/PREVIEW convenience only. In production (NODE_ENV==="production",
// which covers Vercel prod AND preview builds) the fixture fallback is OFF, so an
// unconfigured prod never renders invented listings — it shows an honest empty
// state instead. Mirrors `allowFixtureFallback` in components/discovery/data.ts and
// the sibling seeker/home seams.
const allowFixtureFallback = process.env.NODE_ENV !== "production";

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

// ─── ListingRow → SearchListing adapter ─────────────────────────────────────
// Maps the DB projection (via rowToDiscoveryFields) into the Search lane's
// view-model. Housing and meals provision come from the boolean DB columns;
// summaries are generated because the DB projection does not carry them.

const HOUSING_SUMMARIES = {
	provided: "Housing included",
	partial: "Housing (partial)",
	not_provided: "No housing",
} as const;

const MEALS_SUMMARIES = {
	provided: "Meals included",
	partial: "Meals (partial)",
	not_provided: "No meals",
} as const;

function rowToSearchListing(row: ListingRow): SearchListing {
	const fields = rowToDiscoveryFields(row);
	const { housing, meals, pay } = fields.benefits;
	return {
		id: fields.id,
		title: fields.title,
		hostName: fields.host.name,
		category: fields.category,
		location: fields.location,
		opportunityWindow: fields.opportunityWindow,
		benefits: {
			housing: {
				provision: housing.provision,
				summary: HOUSING_SUMMARIES[housing.provision],
			},
			meals: {
				provision: meals.provision,
				summary: MEALS_SUMMARIES[meals.provision],
			},
			pay: {
				provision: pay.provision,
				summary: pay.summary ?? "",
			},
		},
		verifiedHost: fields.host.verified,
	};
}

// ─── Fixture fallback filtering (dev / preview) ──────────────────────────────
// Applies the same semantic filters as searchListings() but over the local
// SEARCH_FIXTURES. startDate filters are omitted because fixtures lack real
// dates; payUnit filtering is skipped because fixtures don't carry that field.

function applyLocalFilters(
	fixtures: readonly SearchListing[],
	opts: {
		query?: string;
		category?: MarketplaceCategory;
		housing?: boolean;
		meals?: boolean;
		payMin?: number;
		location?: string;
	},
): readonly SearchListing[] {
	const query = opts.query?.trim().toLowerCase() ?? "";
	const location = opts.location?.trim().toLowerCase() ?? "";

	return fixtures.filter((listing) => {
		if (query) {
			const haystack =
				`${listing.title} ${listing.hostName} ${listing.location}`.toLowerCase();
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

	let listings: readonly SearchListing[];
	// Raw rows kept alongside `listings` (same order) to score a signed-in
	// seeker's fit per card below. Empty on the fixture path.
	let scorableRows: ListingRow[] = [];

	if (hasPublicDataConfig) {
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
		const rows = await searchListings(filters);
		scorableRows = rows;
		listings = rows.map(rowToSearchListing);
	} else if (allowFixtureFallback) {
		// Dev / preview only: filter the typed fixture set locally. Never in prod
		// (see `allowFixtureFallback`) — the else branch renders an honest empty
		// state rather than passing off invented listings as real.
		listings = applyLocalFilters(SEARCH_FIXTURES, {
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

	// Stamp each result with the signed-in seeker's ADR-040 fit — the SAME score
	// the listing detail shows. Only developing+ bands are surfaced. Anonymous
	// visitors (and thin profiles) see the plain results, unchanged.
	const { userId } = await optionalAuth();
	if (userId && scorableRows.length === listings.length) {
		const token = await getSupabaseToken();
		const profile = token ? await cachedSeekerProfile(token, userId) : null;
		if (profile && seekerHasMatchInputs(profile)) {
			listings = listings.map((listing, index) => {
				const score = scoreSeekerListingRow(profile, scorableRows[index]);
				return matchBandFor(score) === "needs_attention"
					? listing
					: { ...listing, matchScore: score };
			});
			// Browsing (no text query): lead with the best fits — same rule as
			// /seek, so the two discovery doors rank identically.
			if (!query) {
				listings = [...listings].sort(
					(a, b) => (b.matchScore ?? -1) - (a.matchScore ?? -1),
				);
			}
		}
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
