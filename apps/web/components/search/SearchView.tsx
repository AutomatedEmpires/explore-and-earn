"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";

import {
	MARKETPLACE_CATEGORIES,
	type CompensationUnit,
	type MarketplaceCategory,
} from "@explore-and-earn/contracts";
import type { DiscoveryCardSurface } from "@explore-and-earn/contracts";
import { Chip, Icon, type IconKey } from "@explore-and-earn/ui";

import { ListingCardGrid, type DiscoveryListing } from "../discovery";
import { EmptyState, type EmptyStateChip } from "../discovery/EmptyState";
import {
	SEARCH_CATEGORY_LABELS,
	buildRemoveChips,
	buildSearchHref,
	composeSearchLede,
	countActiveFilters,
	type SearchQueryState,
} from "./searchLede";
import styles from "./SearchView.module.css";

// surface="search" is not part of DISCOVERY_CARD_SURFACES; use the closest real
// canonical value. Deliberately not "matched" (that triggers the match meter).
const SEARCH_SURFACE: DiscoveryCardSurface = "discovery_feed";

const LANDING_LANES = ["farm", "maritime", "remote", "seasonal"] as const;

const BEGINS_OPTIONS: ReadonlyArray<{ months: 1 | 3 | 6; label: string }> = [
	{ months: 1, label: "1 month" },
	{ months: 3, label: "3 months" },
	{ months: 6, label: "6 months" },
];

export interface SearchViewProps {
	/**
	 * Canonical discovery cards — the SAME view-model /seek renders, produced by
	 * the shared rowToDiscoveryFields mapper (provenance/evidence honesty, the
	 * stored >=75 match pill, boosted/skipped enrichment all travel with it).
	 */
	readonly listings: readonly DiscoveryListing[];
	/** Current active text query (from URL). */
	readonly query?: string;
	/** Currently selected category lane (from URL). */
	readonly category?: MarketplaceCategory;
	/** Housing filter is active (from URL). */
	readonly housing?: boolean;
	/** Meals filter is active (from URL). */
	readonly meals?: boolean;
	/** Visa-support filter is active (from URL). */
	readonly visa?: boolean;
	/** Begins-within window in months (from URL). */
	readonly startRangeMonths?: 1 | 3 | 6;
	/** Minimum pay in dollars (from URL). */
	readonly payMin?: number;
	/** Pay unit filter (from URL). */
	readonly payUnit?: CompensationUnit;
	/** Location substring filter (from URL). */
	readonly location?: string;
	/** Earliest start date ISO string YYYY-MM-DD (from URL). */
	readonly startAfter?: string;
	/** Latest start date ISO string YYYY-MM-DD (from URL). */
	readonly startBefore?: string;
	/** Current page (from URL, 1-based). */
	readonly page?: number;
	/** The limit+1 look-ahead found another page. */
	readonly hasMorePages?: boolean;
	/** The marketplace read faulted — render the couldn't-read state. */
	readonly readFailed?: boolean;
}

export function SearchView({
	listings,
	query: initialQuery = "",
	category,
	housing = false,
	meals = false,
	visa = false,
	startRangeMonths,
	payMin,
	payUnit,
	location: initialLocation = "",
	startAfter = "",
	startBefore = "",
	page = 1,
	hasMorePages = false,
	readFailed = false,
}: SearchViewProps) {
	const router = useRouter();

	// Local state for text/number/date inputs; committed on form submit. Chip
	// taps navigate immediately but carry any typed-not-yet-submitted text along.
	const [queryText, setQueryText] = useState(initialQuery ?? "");
	const [locationText, setLocationText] = useState(initialLocation ?? "");
	const [payMinText, setPayMinText] = useState(
		payMin != null ? String(payMin) : "",
	);
	const [payUnitValue, setPayUnitValue] = useState(payUnit ?? "");
	const [startAfterText, setStartAfterText] = useState(startAfter ?? "");
	const [startBeforeText, setStartBeforeText] = useState(startBefore ?? "");
	const [advancedOpen, setAdvancedOpen] = useState(
		payMin != null || Boolean(payUnit) || Boolean(startAfter) || Boolean(startBefore),
	);

	/** The URL-committed state — what the rendered results actually answer to. */
	const urlState: SearchQueryState = {
		query: initialQuery || undefined,
		category,
		housing: housing || undefined,
		meals: meals || undefined,
		visa: visa || undefined,
		startRangeMonths,
		payMin,
		payUnit,
		location: initialLocation || undefined,
		startAfter: startAfter || undefined,
		startBefore: startBefore || undefined,
	};

	/** URL state + typed-but-unsubmitted text, for building the NEXT href. */
	function formState(): SearchQueryState {
		const parsedPay = Number(payMinText);
		return {
			...urlState,
			query: queryText.trim() || undefined,
			location: locationText.trim() || undefined,
			payMin:
				payMinText && Number.isFinite(parsedPay) && parsedPay > 0
					? parsedPay
					: undefined,
			payUnit: (payUnitValue || undefined) as CompensationUnit | undefined,
			startAfter: startAfterText || undefined,
			startBefore: startBeforeText || undefined,
		};
	}

	const navigate = (overrides: Partial<SearchQueryState>) => {
		router.push(buildSearchHref(formState(), overrides));
	};

	const handleSubmit = (event: FormEvent) => {
		event.preventDefault();
		router.push(buildSearchHref(formState()));
	};

	// ── The lede and the count claim only what this page fetched ──────────────
	const activeFilterCount = countActiveFilters(urlState);
	const matchesOnPage = listings.filter(
		(listing) => typeof listing.matchScore === "number",
	).length;
	const lede = composeSearchLede({
		resultCount: listings.length,
		matchesOnPage,
		hasMorePages,
		activeFilterCount,
		readFailed,
	});
	const countLabel = readFailed
		? "Results couldn't be read"
		: listings.length === 0
			? "No results on this page"
			: `${listings.length} ${listings.length === 1 ? "result" : "results"}${hasMorePages ? " on this page, more on the next" : ""}`;

	const showPagination = !readFailed && (page > 1 || hasMorePages);

	return (
		<section className={styles.wrap}>
			<header className={styles.header}>
				<p className={styles.eyebrow}>The marketplace</p>
				<h1 className={styles.heading}>
					Search<span className={styles.titleMark}>.</span>
				</h1>
				<p className={styles.lede}>{lede}</p>
			</header>

			<form className={styles.form} onSubmit={handleSubmit} role="search">
				<div className={styles.queryRow}>
					<div className={styles.field}>
						<label className={styles.label} htmlFor="ee-search-query">
							Search
						</label>
						<input
							id="ee-search-query"
							className={styles.input}
							type="search"
							inputMode="search"
							placeholder="Role, host, or place"
							value={queryText}
							onChange={(event) => setQueryText(event.target.value)}
						/>
					</div>
					<div className={styles.field}>
						<label className={styles.label} htmlFor="ee-search-location">
							Location
						</label>
						<input
							id="ee-search-location"
							className={styles.input}
							type="text"
							placeholder="City, state, or country"
							value={locationText}
							onChange={(event) => setLocationText(event.target.value)}
						/>
					</div>
					<button className={styles.submit} type="submit">
						<Icon name="nav.seek" size={18} aria-hidden />
						Search
					</button>
				</div>

				<div className={styles.filters} role="group" aria-label="Filter by lane">
					<span className={styles.filtersLabel}>Lane</span>
					<div className={styles.chipRow}>
						{MARKETPLACE_CATEGORIES.map((cat) => {
							const selected = category === cat;
							return (
								<button
									key={cat}
									type="button"
									className={styles.chipButton}
									aria-pressed={selected}
									onClick={() =>
										navigate({ category: selected ? undefined : cat })
									}
								>
									<Chip icon={`category.${cat}` as IconKey} selected={selected}>
										{SEARCH_CATEGORY_LABELS[cat]}
									</Chip>
								</button>
							);
						})}
					</div>
				</div>

				<div
					className={styles.filters}
					role="group"
					aria-label="Filter by benefit"
				>
					<span className={styles.filtersLabel}>Benefits</span>
					<div className={styles.chipRow}>
						<button
							type="button"
							className={styles.chipButton}
							aria-pressed={housing}
							onClick={() => navigate({ housing: housing ? undefined : true })}
						>
							<Chip icon={"benefit.housing" as IconKey} selected={housing}>
								Housing
							</Chip>
						</button>
						<button
							type="button"
							className={styles.chipButton}
							aria-pressed={meals}
							onClick={() => navigate({ meals: meals ? undefined : true })}
						>
							<Chip icon={"benefit.meals" as IconKey} selected={meals}>
								Meals
							</Chip>
						</button>
						<button
							type="button"
							className={styles.chipButton}
							aria-pressed={visa}
							onClick={() => navigate({ visa: visa ? undefined : true })}
						>
							<Chip selected={visa}>Visa support</Chip>
						</button>
					</div>
				</div>

				<div
					className={styles.filters}
					role="group"
					aria-label="Filter by start window"
				>
					<span className={styles.filtersLabel}>Begins within</span>
					<div className={styles.chipRow}>
						{BEGINS_OPTIONS.map(({ months, label }) => {
							const selected = startRangeMonths === months;
							return (
								<button
									key={months}
									type="button"
									className={styles.chipButton}
									aria-pressed={selected}
									onClick={() =>
										navigate({
											startRangeMonths: selected ? undefined : months,
										})
									}
								>
									<Chip selected={selected}>{label}</Chip>
								</button>
							);
						})}
					</div>
				</div>

				<details
					className={styles.advanced}
					open={advancedOpen}
					onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
				>
					<summary className={styles.advancedSummary}>
						<Icon name="action.forward" size={14} aria-hidden />
						Pay &amp; exact dates
					</summary>
					<div className={styles.advancedGrid}>
						<div className={styles.field}>
							<label className={styles.label} htmlFor="ee-search-pay-min">
								Min pay
							</label>
							<input
								id="ee-search-pay-min"
								className={styles.input}
								type="number"
								min="0"
								step="1"
								placeholder="e.g. 20"
								value={payMinText}
								onChange={(event) => setPayMinText(event.target.value)}
							/>
						</div>
						<div className={styles.field}>
							<label className={styles.label} htmlFor="ee-search-pay-unit">
								Per
							</label>
							<select
								id="ee-search-pay-unit"
								className={`${styles.input} ${styles.select}`}
								value={payUnitValue}
								onChange={(event) => setPayUnitValue(event.target.value)}
							>
								{/* Intentionally limited to the two time-rate units that are
								    meaningful as search filters. */}
								<option value="">Any</option>
								<option value="hour">Hour</option>
								<option value="day">Day</option>
							</select>
						</div>
						<div className={styles.field}>
							<label className={styles.label} htmlFor="ee-search-start-after">
								Starts after
							</label>
							<input
								id="ee-search-start-after"
								className={styles.input}
								type="date"
								value={startAfterText}
								onChange={(event) => setStartAfterText(event.target.value)}
							/>
						</div>
						<div className={styles.field}>
							<label className={styles.label} htmlFor="ee-search-start-before">
								Starts before
							</label>
							<input
								id="ee-search-start-before"
								className={styles.input}
								type="date"
								value={startBeforeText}
								onChange={(event) => setStartBeforeText(event.target.value)}
							/>
						</div>
					</div>
				</details>
			</form>

			<div className={styles.results}>
				<p className={styles.count} role="status" aria-live="polite">
					{countLabel}
				</p>

				<ListingCardGrid
					listings={listings as DiscoveryListing[]}
					surface={SEARCH_SURFACE}
					overrides={{ onApply: (id) => router.push(`/listing/${id}`) }}
					eagerCount={3}
					emptyState={
						<SearchEmptyState urlState={urlState} readFailed={readFailed} />
					}
				/>

				{showPagination ? (
					<nav className={styles.pagination} aria-label="Search results pages">
						<p className={styles.srOnly} aria-live="polite" aria-atomic="true">
							{`Page ${page}${hasMorePages ? "" : ", last page"}`}
						</p>
						{page > 1 ? (
							<a
								className={styles.pageLink}
								href={buildSearchHref(urlState, { page: page - 1 })}
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
						<span className={styles.pageStatus} aria-current="page">
							Page {page}
						</span>
						{hasMorePages ? (
							<a
								className={styles.pageLink}
								href={buildSearchHref(urlState, { page: page + 1 })}
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
			</div>
		</section>
	);
}

/**
 * Zero rendered results has THREE distinct truths (see searchLede.ts):
 *   - the read faulted → say so; never dress an outage up as "no listings".
 *   - filters active → the filters are the cause; name them and make each one
 *     removable as a plain link (the W3 /seek recovery pattern).
 *   - no filters → the marketplace has no live inventory yet; say that
 *     plainly and open the four lane landings instead of apologizing.
 */
function SearchEmptyState({
	urlState,
	readFailed,
}: {
	readonly urlState: SearchQueryState;
	readonly readFailed?: boolean;
}) {
	const activeCount = countActiveFilters(urlState);

	if (readFailed) {
		return (
			<div className={styles.emptyWrap}>
				<EmptyState
					title="The marketplace couldn't be read"
					message="Something between us and the listings failed just now. Nothing is gone — refresh in a moment and this page will try again."
					icon="nav.seek"
					actionLabel="Try again"
					actionHref={buildSearchHref(urlState)}
				/>
			</div>
		);
	}

	if (activeCount === 0) {
		const laneDoors: EmptyStateChip[] = LANDING_LANES.map((lane) => ({
			label: SEARCH_CATEGORY_LABELS[lane],
			href: `/jobs/${lane}`,
			icon: `category.${lane}` as IconKey,
		}));
		return (
			<div className={styles.emptyWrap}>
				<EmptyState
					title="No opportunities are live right now"
					message="We only publish roles that answer housing, meals, and pay up front — the moment the first listing opens, it lands here. The four lanes show the kinds of work this marketplace carries."
					suggestions={laneDoors}
					suggestionsLabel="Scout the four lanes"
					actionLabel="Open the map"
					actionHref="/map"
				/>
			</div>
		);
	}

	const removeChips: EmptyStateChip[] = buildRemoveChips(urlState).map(
		(chip) => ({
			label: chip.label,
			href: chip.href,
			icon: chip.icon as IconKey | undefined,
		}),
	);
	const lanes: EmptyStateChip[] = LANDING_LANES.map((lane) => ({
		label: SEARCH_CATEGORY_LABELS[lane],
		href: buildSearchHref({ category: lane }),
		icon: `category.${lane}` as IconKey,
	}));
	const filterNoun = activeCount === 1 ? "active filter" : "active filters";
	return (
		<div className={styles.emptyWrap}>
			<EmptyState
				title={
					urlState.query
						? `No matches for “${urlState.query}”`
						: "These filters came up empty"
				}
				message={`Every open role is being screened out by your ${activeCount} ${filterNoun}. Drop one below and the trail usually reopens.`}
				filterChips={removeChips}
				filterChipsLabel="Loosen a filter"
				suggestions={lanes}
				suggestionsLabel="Or scout a lane"
				actionLabel="Clear all filters"
				actionHref="/search"
			/>
		</div>
	);
}
