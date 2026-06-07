import type { Metadata } from "next";

import {
	type SearchFilters,
	rowToDiscoveryFields,
	searchListings,
} from "@explore-and-earn/db";
import { MARKETPLACE_CATEGORIES } from "@explore-and-earn/contracts";

import type { DiscoveryListing } from "../../../components/discovery";
import { SeekBrowser } from "../../../components/seeker";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	title: "Seek",
};

/** Results returned per Seek page (matches the DB default search limit). */
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

function parseCategory(
	value: string | string[] | undefined,
): string | undefined {
	const raw = firstValue(value);
	return raw && (MARKETPLACE_CATEGORIES as readonly string[]).includes(raw)
		? raw
		: undefined;
}

/** Accept only YYYY-MM-DD so a junk ?start_after never reaches the query. */
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

/**
 * Seek \u2014 the seeker-scope opportunity feed, backed by a real server-side
 * search. All filter state lives in the URL query (q / category / housing /
 * meals / pay_min / location / start_after / start_before / page) so a filtered
 * view is shareable, bookmarkable, and re-rendered on the server. This page
 * parses the URL into SearchFilters, runs searchListings against live listings,
 * and maps the rows into the DiscoveryListing view-model; SeekBrowser renders
 * the controls + the canonical DiscoveryCard grid and drives the URL.
 *
 * Pagination is server-side and stateless: we request PAGE_SIZE + 1 rows so a
 * single round-trip tells us whether a next page exists, then render plain
 * <a> prev/next links that only mutate the ?page param.
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
	const startAfter = parseDate(params.start_after);
	const startBefore = parseDate(params.start_before);
	const page = parsePage(params.page);
	const offset = (page - 1) * PAGE_SIZE;

	const filters: SearchFilters = {
		query,
		categories: category ? [category] : undefined,
		hasHousing: housing,
		hasMeals: meals,
		payMin,
		location,
		startDateAfter: startAfter,
		startDateBefore: startBefore,
		limit: PAGE_SIZE + 1,
		offset,
	};

	const rows = await searchListings(filters);
	const hasNextPage = rows.length > PAGE_SIZE;
	const pageRows = hasNextPage ? rows.slice(0, PAGE_SIZE) : rows;
	const listings = pageRows.map(
		(row) => rowToDiscoveryFields(row) as DiscoveryListing,
	);

	const buildPageHref = (targetPage: number): string => {
		const sp = new URLSearchParams();
		if (query) sp.set("q", query);
		if (category) sp.set("category", category);
		if (housing) sp.set("housing", "1");
		if (meals) sp.set("meals", "1");
		if (payMin != null) sp.set("pay_min", String(payMin));
		if (location) sp.set("location", location);
		if (startAfter) sp.set("start_after", startAfter);
		if (startBefore) sp.set("start_before", startBefore);
		if (targetPage > 1) sp.set("page", String(targetPage));
		const qs = sp.toString();
		return qs ? `/seek?${qs}` : "/seek";
	};

	const showPagination = page > 1 || hasNextPage;

	return (
		<>
			<SeekBrowser
				listings={listings}
				query={query}
				category={category}
				housing={housing}
				meals={meals}
				location={location}
				payMin={payMin}
				startAfter={startAfter}
				startBefore={startBefore}
			/>
			{showPagination ? (
				<nav className={styles.pagination} aria-label="Search results pages">
					{page > 1 ? (
						<a
							className={styles.pageLink}
							href={buildPageHref(page - 1)}
							rel="prev"
						>
							Previous
						</a>
					) : (
						<span
							className={`${styles.pageLink} ${styles.pageLinkDisabled}`}
							aria-disabled="true"
						>
							Previous
						</span>
					)}
					<span className={styles.pageStatus}>Page {page}</span>
					{hasNextPage ? (
						<a
							className={styles.pageLink}
							href={buildPageHref(page + 1)}
							rel="next"
						>
							Next
						</a>
					) : (
						<span
							className={`${styles.pageLink} ${styles.pageLinkDisabled}`}
							aria-disabled="true"
						>
							Next
						</span>
					)}
				</nav>
			) : null}
		</>
	);
}
