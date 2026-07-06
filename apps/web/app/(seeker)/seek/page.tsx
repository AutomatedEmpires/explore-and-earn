import type { Metadata } from "next";
import { auth, currentUser } from "@clerk/nextjs/server";

import {
	type SearchFilters,
	getSavedSearches,
	rowToDiscoveryFields,
	savedSearchToQueryString,
	scoreSeekerListingRow,
	searchListings,
	seekerHasMatchInputs,
} from "@explore-and-earn/db";
import {
	type CompensationUnit,
	MARKETPLACE_CATEGORIES,
	matchBandFor,
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
import { SeekerDashboard } from "../../../components/seeker/SeekerDashboard";
import { getSeekerStatus, getMatchedListings } from "../../../components/seeker/data";
import { cachedSeekerProfile, getSupabaseToken } from "../../../lib/serverCache";
import { buildFeaturedEmployers } from "../../../lib/employer-utils";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	title: "Browse seasonal jobs — housing, meals & pay upfront",
	description:
		"Browse live seasonal opportunities across farm, maritime, remote, and resort work. Every listing answers housing, meals, and pay before you apply.",
	alternates: { canonical: "/seek" },
};

const PAGE_SIZE = 48;

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

function parseDate(value: string | string[] | undefined): string | undefined {
	const raw = firstValue(value);
	return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : undefined;
}

function parsePage(value: string | string[] | undefined): number {
	const raw = firstValue(value);
	if (!raw) return 1;
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) && parsed > 1 ? parsed : 1;
}

function beginsWithinRange(
	listing: DiscoveryListing,
	startRangeMonths: 1 | 3 | 6 | undefined,
): boolean {
	if (!startRangeMonths) return true;
	if (!listing.begins) return false;

	const beginsDate = new Date(listing.begins);
	if (Number.isNaN(beginsDate.getTime())) return false;

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
		if (!haystack.includes(query)) return false;
	}

	if (filters.categories?.length && !filters.categories.includes(listing.category)) return false;
	if (filters.hasHousing && listing.benefits.housing.provision === "not_provided") return false;
	if (filters.hasMeals && listing.benefits.meals.provision === "not_provided") return false;
	if (filters.visaSupport && !listing.visaSupport) return false;
	if (filters.payUnit && listing.payInsight?.unit !== filters.payUnit) return false;

	if (
		filters.payMin != null &&
		Number.isFinite(filters.payMin) &&
		filters.payMin > 0
	) {
		const min = listing.payInsight?.minCents;
		if (min == null || min < Math.round(filters.payMin * 100)) return false;
	}

	if (
		filters.location &&
		!listing.location.toLowerCase().includes(filters.location.toLowerCase())
	) {
		return false;
	}

	return beginsWithinRange(listing, filters.startRangeMonths);
}

export default async function SeekPage({
	searchParams,
}: {
	searchParams: Promise<SeekSearchParams>;
}) {
	const params = await searchParams;

	// Auth — optional; dashboard only renders when signed in
	const { userId } = await auth();
	const token = userId ? await getSupabaseToken() : null;

	// Parse discovery filters from URL
	const query = firstValue(params.q);
	const category = parseCategory(params.category);
	const housing = parseBoolean(params.housing);
	const meals = parseBoolean(params.meals);
	const visaSupport = parseBoolean(params.visa);
	const startRangeMonths = parseStartRange(params.start_range);
	const payMin = parsePayMin(params.pay_min);
	const payUnit = parsePayUnit(params.pay_unit);
	const location = firstValue(params.location);
	const startAfter = parseDate(params.start_after);
	const startBefore = parseDate(params.start_before);
	const page = parsePage(params.page);
	const offset = (page - 1) * PAGE_SIZE;

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
		startDateAfter: startAfter,
		startDateBefore: startBefore,
		limit: PAGE_SIZE + 1,
		offset,
	};

	const hasPublicDataConfig = hasDiscoveryPublicDataConfig();
	const canUseFixtures = canUseDiscoveryFixtureFallback();

	let hasNextPage = false;
	let listings: DiscoveryListing[] = [];
	// Raw rows kept alongside `listings` (same order) so a signed-in seeker's
	// fit can be scored per card below. Empty on the fixture path.
	let scorableRows: Awaited<ReturnType<typeof searchListings>> = [];

	if (hasPublicDataConfig) {
		const rows = await searchListings(filters);
		hasNextPage = rows.length > PAGE_SIZE;
		const pageRows = hasNextPage ? rows.slice(0, PAGE_SIZE) : rows;
		scorableRows = pageRows;
		listings = pageRows.map((row) => rowToDiscoveryFields(row) as DiscoveryListing);
	} else if (canUseFixtures) {
		const filtered = DISCOVERY_FIXTURES.filter((listing) =>
			matchesLocalFilters(listing, filters),
		);
		const pageRows = filtered.slice(offset, offset + PAGE_SIZE + 1);
		hasNextPage = pageRows.length > PAGE_SIZE;
		listings = pageRows.slice(0, PAGE_SIZE);
	} else {
		warnIfDiscoveryDataMissingInProduction("seek/page");
	}

	// The employer rail derives from the same inventory as the results: real
	// rows when the DB is configured, fixtures only where fixtures are allowed.
	// Never fixture employers in production — their lst_* links cannot resolve.
	const featuredEmployers = buildFeaturedEmployers(
		hasPublicDataConfig ? listings : canUseFixtures ? DISCOVERY_FIXTURES : [],
	);

	const buildPageHref = (targetPage: number): string => {
		const sp = new URLSearchParams();
		if (query) sp.set("q", query);
		if (category) sp.set("category", category);
		if (housing) sp.set("housing", "1");
		if (meals) sp.set("meals", "1");
		if (visaSupport) sp.set("visa", "1");
		if (startRangeMonths) sp.set("start_range", String(startRangeMonths));
		if (payMin != null) sp.set("pay_min", String(payMin));
		if (payUnit) sp.set("pay_unit", payUnit);
		if (location) sp.set("location", location);
		if (startAfter) sp.set("start_after", startAfter);
		if (startBefore) sp.set("start_before", startBefore);
		if (targetPage > 1) sp.set("page", String(targetPage));
		const qs = sp.toString();
		return qs ? `/seek?${qs}` : "/seek";
	};

	const showPagination = page > 1 || hasNextPage;

	// Dashboard data — only fetched when signed in
	let dashboardProps = null;
	let savedSearchViews: { id: string; label: string; href: string }[] = [];
	if (userId && token) {
		const clerkUser = await currentUser();
		const fallbackName =
			clerkUser?.firstName
				? [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ")
				: "Seeker";

		const [status, matchedListings, profile, savedSearches] = await Promise.all([
			getSeekerStatus(token, userId, fallbackName),
			getMatchedListings(token, userId),
			cachedSeekerProfile(token, userId),
			getSavedSearches(token, userId).catch(() => []),
		]);

		// Per saved search, count live listings published AFTER it was saved that
		// still match its filters — the "N new" alert the seeker sees on return.
		// searchListings is the public/anon path, so this works without the
		// seeker token. Capped at 8 searches to bound page-load fan-out.
		savedSearchViews = await Promise.all(
			savedSearches.slice(0, 8).map(async (s) => {
				const f = s.filters;
				let newCount = 0;
				try {
					const rows = await searchListings({
						query: f.q,
						categories: f.category ? [f.category] : undefined,
						hasHousing: f.housing,
						hasMeals: f.meals,
						visaSupport: f.visa,
						startRangeMonths: f.startRangeMonths as SearchFilters["startRangeMonths"],
						payMin: f.payMin,
						payUnit: f.payUnit as SearchFilters["payUnit"],
						location: f.location,
						limit: 24,
					});
					newCount = rows.filter(
						(r) => r.published_at != null && r.published_at > s.createdAt,
					).length;
				} catch {
					/* count stays 0 — never block the page on an alert count */
				}
				return {
					id: s.id,
					label: s.label,
					href: savedSearchToQueryString(s.filters),
					newCount,
				};
			}),
		);

		dashboardProps = {
			profile,
			status,
			matchedListings: matchedListings.slice(0, 12),
			seekerName: status.seekerName,
			featuredEmployers,
		};

		// Stamp each grid card with the seeker's ADR-040 fit — the SAME score the
		// listing it opens will show. Only developing+ bands are surfaced, so the
		// grid highlights genuine fits instead of labelling every card.
		if (profile && seekerHasMatchInputs(profile) && scorableRows.length === listings.length) {
			listings = listings.map((listing, index) => {
				const score = scoreSeekerListingRow(profile, scorableRows[index]);
				return matchBandFor(score) === "needs_attention"
					? listing
					: { ...listing, matchScore: score };
			});
		}
	}

	return (
		<>
			{dashboardProps && (
				<SeekerDashboard {...dashboardProps} />
			)}

			<div className={dashboardProps ? styles.discoverSection : undefined}>
				{dashboardProps && (
					<h2 className={styles.discoverHeading}>Discover Opportunities</h2>
				)}
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
					savedSearches={savedSearchViews}
				/>
			</div>

			{showPagination ? (
				<nav className={styles.pagination} aria-label="Search results pages">
					<p className={styles.srOnly} aria-live="polite" aria-atomic="true">
						{`Page ${page}${hasNextPage ? "" : ", last page"}`}
					</p>
					{page > 1 ? (
						<a className={styles.pageLink} href={buildPageHref(page - 1)} rel="prev">
							Previous
						</a>
					) : (
						<span className={`${styles.pageLink} ${styles.pageLinkDisabled}`} aria-disabled="true">
							Previous
						</span>
					)}
					<span className={styles.pageStatus} aria-current="page">Page {page}</span>
					{hasNextPage ? (
						<a className={styles.pageLink} href={buildPageHref(page + 1)} rel="next">
							Next
						</a>
					) : (
						<span className={`${styles.pageLink} ${styles.pageLinkDisabled}`} aria-disabled="true">
							Next
						</span>
					)}
				</nav>
			) : null}
		</>
	);
}
