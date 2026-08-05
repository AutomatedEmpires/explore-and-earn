import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";

import {
	type DiscoveryEnrichment,
	type SearchFilters,
	type SeekerScope,
	EMPTY_BEHAVIOR_PROFILE,
	behavioralAdjustment,
	computeBehaviorProfile,
	enrichmentFromScope,
	getMatchDetailsForSeeker,
	getMatchScoresForSeeker,
	getSavedListingIds,
	getSavedSearches,
	getSeekerBehaviorInteractions,
	resolveSeekerDiscoveryScope,
	rowToDiscoveryFields,
	savedSearchToQueryString,
	searchListings,
} from "@explore-and-earn/db";
import {
	type CompensationUnit,
	MARKETPLACE_CATEGORIES,
} from "@explore-and-earn/contracts";
import { rankForSeeker } from "../../../../lib/ranking";

import {
	DISCOVERY_FIXTURES,
	type DiscoveryListing,
} from "../../../../components/discovery";
import {
	canUseDiscoveryFixtureFallback,
	hasDiscoveryPublicDataConfig,
	warnIfDiscoveryDataMissingInProduction,
} from "../../../../components/discovery/data";
import { SeekBrowser } from "../../../../components/seeker";
import { getSupabaseToken } from "../../../../lib/serverCache";
import { buildFeaturedEmployers } from "../../../../lib/employer-utils";
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

	// Signed-in seeker scope — resolved ONCE: the applied/skipped/boosted id sets,
	// the stored ADR-040 match scores, and the behavior profile. Threading the
	// scope into searchListings runs the applied HARD-exclusion server-side; the
	// enrichment stamps boosted/skipped/match onto every card via
	// rowToDiscoveryFields; the behavior profile feeds the bounded ranking
	// tiebreak. Best-effort: any fault degrades to the anonymous path (no scope,
	// no enrichment) so discovery never dead-ends on a personalization fault.
	let seekerScope: SeekerScope | undefined;
	let enrichment: DiscoveryEnrichment | undefined;
	let storedScores: ReadonlyMap<string, number> = new Map();
	let behaviorProfile = EMPTY_BEHAVIOR_PROFILE;
	let savedListingIds: readonly string[] = [];
	let skippedListingIds: readonly string[] = [];
	if (userId && token && hasPublicDataConfig) {
		try {
			const [scope, scores, details, behaviorInteractions, savedIds] =
				await Promise.all([
					resolveSeekerDiscoveryScope(token, userId),
					getMatchScoresForSeeker(token, userId).catch(
						() => new Map<string, number>(),
					),
					// Component sub-scores, so every match pill on this page can explain
					// itself. Best-effort like the rest of the scope: no details means no
					// reasons, never invented ones.
					getMatchDetailsForSeeker(token, userId).catch(() => undefined),
					getSeekerBehaviorInteractions(token, userId).catch(() => []),
					getSavedListingIds(token, userId).catch(() => [] as string[]),
				]);
			seekerScope = { clerkToken: token, clerkUserId: userId };
			storedScores = scores;
			enrichment = enrichmentFromScope(scope, scores, details);
			savedListingIds = savedIds;
			skippedListingIds = [...scope.skippedIds];
			behaviorProfile = computeBehaviorProfile(
				behaviorInteractions ?? [],
				Date.now(),
			);
		} catch {
			// Leave the anonymous path: no scope, no enrichment, raw recency order.
		}
	}

	let hasNextPage = false;
	let listings: DiscoveryListing[] = [];

	if (hasPublicDataConfig) {
		// Pass the seeker scope so searchListings HARD-excludes applied listings
		// (an applied listing must never resurface as applyable).
		const rows = await searchListings(filters, seekerScope);
		hasNextPage = rows.length > PAGE_SIZE;
		const pageRows = hasNextPage ? rows.slice(0, PAGE_SIZE) : rows;
		listings = pageRows.map(
			(row) => rowToDiscoveryFields(row, enrichment) as DiscoveryListing,
		);
		// MATCH-PRIMARY seeker ranking (founder law): stored-score band first,
		// previously-skipped demoted-but-visible, monetization a bounded secondary
		// lift, behavior a bounded tiebreak. Stable sort keeps the underlying
		// published_at order within a band. Anonymous visitors keep raw recency.
		if (seekerScope) {
			listings = rankForSeeker(listings, (listing) => ({
				boosted: listing.conditionalBadges?.includes("boosted") ?? false,
				hostTier: listing.host.tier,
				matchScore: storedScores.get(listing.id),
				previouslySkipped: listing.previouslySkipped,
				behaviorAdjustment: behavioralAdjustment(
					behaviorProfile,
					listing.category,
				),
			}));
		}
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
	const visibleListingIds = new Set(listings.map((listing) => listing.id));
	const initialSavedListingIds = savedListingIds.filter((id) =>
		visibleListingIds.has(id),
	);
	const initialSavedListingIdSet = new Set(initialSavedListingIds);
	const initialSkippedListingIds = skippedListingIds.filter(
		(id) => visibleListingIds.has(id) && !initialSavedListingIdSet.has(id),
	);

	// Saved searches — the only personalization /seek still carries.
	//
	// THE DASHBOARD USED TO LIVE HERE, AND THAT WAS THE BUG. A signed-in seeker
	// opening the marketplace's search surface was shown a welcome banner, a
	// readiness slider, a pipeline, a résumé nudge and two rails BEFORE the first
	// result — the dashboard swallowed discovery on the one route whose entire
	// job is discovery. The dashboard is now its own destination (/home) and
	// /seek is search, start to finish. See (seeker)/home/page.tsx.
	let savedSearchViews: { id: string; label: string; href: string }[] = [];
	seekerSavedSearches: if (userId && token) {
		let savedSearches;
		try {
			savedSearches = await getSavedSearches(token, userId).catch(() => []);
		} catch {
			break seekerSavedSearches;
		}

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

		// The grid's match %, applied HARD-exclusion, previously-skipped marker,
		// and MATCH-PRIMARY order were already stamped up front from the stored
		// scope + enrichment (see the `seekerScope` block above) — no per-render
		// re-scoring here.
	}

	return (
		<>
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
				startAfter={startAfter}
				startBefore={startBefore}
				savedSearches={savedSearchViews}
				hasMorePages={hasNextPage}
				isAuthenticated={Boolean(userId)}
				initialSavedListingIds={initialSavedListingIds}
				initialSkippedListingIds={initialSkippedListingIds}
			/>

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
