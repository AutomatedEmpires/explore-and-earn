"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type {
	CompensationUnit,
	OpportunityCategory,
} from "@explore-and-earn/contracts";
import { Icon, type IconKey } from "@explore-and-earn/ui";

import {
	CATEGORY_ICON,
	CATEGORY_LABEL,
	EmptyState,
	ListingCardGrid,
	type DiscoveryListing,
	type ListingCardPopupOverrides,
} from "../discovery";
import {
	FeaturedEmployersRail,
	type FeaturedEmployer,
} from "../public/FeaturedEmployersRail";
import { passListingAction, saveListingAction } from "../../app/actions/swipe";
import { SEEKER_DISCOVERY_EVENTS, captureEvent } from "../../lib/analytics";
import styles from "./SeekBrowser.module.css";
import { SeekFilterPopup, type SeekFilterPopupValue } from "./SeekFilterPopup";
import { SavedSearches, type SavedSearchView } from "./SavedSearches";
import { SeekQuickFilters } from "./SeekQuickFilters";
import { SeekSortPopup } from "./SeekSortPopup";

type StartRangeMonths = 1 | 3 | 6;
type PayUnit = Extract<CompensationUnit, "hour" | "day">;

const SEARCH_DEBOUNCE_MS = 400;

/**
 * SORT is client-side over the CURRENT PAGE, and says so.
 *
 * The server orders by (published_at DESC, id DESC) and pages with .range(), so
 * a "sort by pay" that only reordered the 48 rows already fetched while
 * presenting itself as a global sort would be a lie at every page boundary
 * except the first. The control is therefore labelled "Sort this page", and
 * "Newest" is the identity option that hands the server order straight back.
 */
const SORT_OPTIONS = [
	{ id: "newest", label: "Newest first" },
	{ id: "match", label: "Best match" },
	{ id: "pay", label: "Highest pay" },
	{ id: "soonest", label: "Starting soonest" },
] as const;
type SortId = (typeof SORT_OPTIONS)[number]["id"];

/** Comparable pay floor in cents, or null when the listing states no range. */
function payFloor(listing: DiscoveryListing): number | null {
	const cents = listing.payInsight?.minCents;
	return typeof cents === "number" ? cents : null;
}

function startTime(listing: DiscoveryListing): number | null {
	if (!listing.begins) return null;
	const parsed = Date.parse(listing.begins);
	return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Sort the page. Listings that cannot be judged on the chosen axis are never
 * hidden and never promoted — they sink to the end in their original order, so
 * a missing pay range costs a listing its position but not its existence.
 */
function sortListings(
	listings: readonly DiscoveryListing[],
	sort: SortId,
): readonly DiscoveryListing[] {
	if (sort === "newest") return listings;
	const keyed = listings.map((listing, index) => ({ listing, index }));
	const value = (listing: DiscoveryListing): number | null =>
		sort === "match"
			? listing.matchScore ?? null
			: sort === "pay"
				? payFloor(listing)
				: startTime(listing);
	// Ascending for "starting soonest", descending for match and pay.
	const ascending = sort === "soonest";
	keyed.sort((a, b) => {
		const av = value(a.listing);
		const bv = value(b.listing);
		if (av === null && bv === null) return a.index - b.index;
		if (av === null) return 1;
		if (bv === null) return -1;
		if (av === bv) return a.index - b.index;
		return ascending ? av - bv : bv - av;
	});
	return keyed.map((entry) => entry.listing);
}

export interface SeekBrowserProps {
	readonly listings: readonly DiscoveryListing[];
	readonly featuredEmployers?: readonly FeaturedEmployer[];
	readonly query?: string;
	readonly category?: string;
	readonly housing?: boolean;
	readonly meals?: boolean;
	readonly visaSupport?: boolean;
	readonly startRangeMonths?: StartRangeMonths;
	readonly location?: string;
	readonly payMin?: number;
	readonly payUnit?: CompensationUnit;
	readonly startAfter?: string;
	readonly startBefore?: string;
	readonly savedSearches?: readonly SavedSearchView[];
	/** Total across all pages is unknown; this page's count is what we can claim. */
	readonly hasMorePages?: boolean;
	/** Signed-out visitors get the same browse, but save/skip route to sign-in. */
	readonly isAuthenticated?: boolean;
}

/**
 * SeekBrowser — the serious-search surface (V2-G Part VII).
 *
 * WHAT CHANGED AND WHY.
 *
 * 1. IT RENDERS THE CANONICAL CARD WRAPPER. This component used to build its
 *    own popup host — five useState slots, five resolvers, five drawers — a
 *    verbatim fork of the wiring that already lives in useListingCardPopups.
 *    The fork is why the card's newer popovers never reached /seek. It now
 *    renders <ListingCardGrid>, so every popup the card grows, /seek gets.
 *
 * 2. SAVE AND SKIP ACTUALLY DO SOMETHING. The card's decision bar renders
 *    whenever an open handler exists, so /seek was drawing a Save button and a
 *    Skip button with NO handlers behind them: both were silent no-ops on the
 *    marketplace's main browse surface. They are now wired to the same
 *    persisted actions the swipe deck uses.
 *
 * 3. EVERY FILTER MAPS TO A REAL COLUMN. Location and the explicit start-date
 *    window were parsed by the server page and applied by searchListings, but
 *    no control ever set them, so two working filters were unreachable. They
 *    are in the filter popover now. Nothing has been added that the query
 *    cannot serve — see the filter popover for the enumerated set.
 *
 * All filter state stays in the URL: the server page parses it, runs
 * searchListings, and hands the filtered rows here, so a filtered view is
 * shareable and bookmarkable. Sort and the grid/list view are client-side view
 * state and are labelled as such.
 */
export function SeekBrowser({
	listings,
	featuredEmployers = [],
	query,
	category,
	housing = false,
	meals = false,
	visaSupport = false,
	startRangeMonths,
	location,
	payMin,
	payUnit,
	startAfter,
	startBefore,
	savedSearches = [],
	hasMorePages = false,
	isAuthenticated = true,
}: SeekBrowserProps) {
	const pathname = usePathname();
	const router = useRouter();
	const searchParams = useSearchParams();

	const [searchText, setSearchText] = useState<string>(query ?? "");
	const [filterOpen, setFilterOpen] = useState(false);
	const [laneOpen, setLaneOpen] = useState(false);
	const [sort, setSort] = useState<SortId>("newest");
	const [view, setView] = useState<"grid" | "list">("grid");
	const [savedIds, setSavedIds] = useState<ReadonlySet<string>>(new Set());
	const [skippedIds, setSkippedIds] = useState<ReadonlySet<string>>(new Set());
	const [, startAction] = useTransition();

	const currentQuery = query ?? "";

	// Debounced free-text search -> ?q=. router.replace avoids stacking a history
	// entry per keystroke; we only navigate once the debounced text differs from
	// what the server last rendered (currentQuery), which also prevents a loop
	// after the param round-trips back in as a prop.
	useEffect(() => {
		const trimmed = searchText.trim();
		if (trimmed === currentQuery) {
			return;
		}
		const timeout = setTimeout(() => {
			const next = new URLSearchParams(searchParams.toString());
			if (trimmed) {
				next.set("q", trimmed);
			} else {
				next.delete("q");
			}
			const queryString = next.toString();
			router.replace(queryString ? `${pathname}?${queryString}` : pathname);
		}, SEARCH_DEBOUNCE_MS);
		return () => clearTimeout(timeout);
	}, [searchText, currentQuery, pathname, router, searchParams]);

	const pushParam = (key: string, value: string | null) => {
		const next = new URLSearchParams(searchParams.toString());
		if (value === null || value === "") {
			next.delete(key);
		} else {
			next.set(key, value);
		}
		const queryString = next.toString();
		router.push(queryString ? `${pathname}?${queryString}` : pathname);
	};

	const results = useMemo(() => sortListings(listings, sort), [listings, sort]);

	const hasActiveFilters =
		Boolean(query) ||
		Boolean(category) ||
		housing ||
		meals ||
		visaSupport ||
		Boolean(startRangeMonths) ||
		Boolean(location) ||
		payMin != null ||
		Boolean(payUnit) ||
		Boolean(startAfter) ||
		Boolean(startBefore);

	const activeFilterChips = useMemo(() => {
		const chips: { label: string; icon: IconKey }[] = [];
		if (startRangeMonths) {
			chips.push({ label: `${startRangeMonths} mo`, icon: "status.begins" });
		}
		if (startAfter || startBefore) {
			chips.push({
				label: `${startAfter ?? "any"} → ${startBefore ?? "any"}`,
				icon: "status.begins",
			});
		}
		if (visaSupport) {
			chips.push({ label: "Visa", icon: "system.info" });
		}
		if (housing) {
			chips.push({ label: "Housing", icon: "benefit.housing" });
		}
		if (meals) {
			chips.push({ label: "Meals", icon: "benefit.meals" });
		}
		if (payMin != null && payMin > 0) {
			chips.push({
				label: `$${payMin}${payUnit ? `/${payUnit}` : ""}`,
				icon: "benefit.pay",
			});
		}
		if (location) {
			chips.push({ label: location, icon: "nav.map" });
		}
		return chips;
	}, [
		housing,
		location,
		meals,
		payMin,
		payUnit,
		startAfter,
		startBefore,
		startRangeMonths,
		visaSupport,
	]);

	const filterCount = activeFilterChips.length;

	// Current filter set + a human label, for the "save this search" affordance.
	const currentFilters = {
		q: query || undefined,
		category: category || undefined,
		housing: housing || undefined,
		meals: meals || undefined,
		visa: visaSupport || undefined,
		startRangeMonths,
		payMin: payMin && payMin > 0 ? payMin : undefined,
		payUnit: payUnit || undefined,
		location: location || undefined,
	};
	const currentLabel =
		[
			category ? CATEGORY_LABEL[category as OpportunityCategory] : null,
			housing ? "Housing" : null,
			meals ? "Meals" : null,
			payMin ? `$${payMin}${payUnit ? `/${payUnit}` : ""}` : null,
			startRangeMonths ? `${startRangeMonths}mo start` : null,
			location || null,
			query ? `“${query}”` : null,
		]
			.filter(Boolean)
			.join(" · ") || "All opportunities";

	const applyFilters = (value: SeekFilterPopupValue) => {
		const next = new URLSearchParams(searchParams.toString());
		const set = (key: string, on: unknown, raw?: string) => {
			if (on) next.set(key, raw ?? "1");
			else next.delete(key);
		};
		set("housing", value.housing);
		set("meals", value.meals);
		set("visa", value.visaSupport);
		set("start_range", value.startRangeMonths, String(value.startRangeMonths));
		set("location", value.location?.trim(), value.location?.trim());
		set("start_after", value.startAfter, value.startAfter);
		set("start_before", value.startBefore, value.startBefore);
		// pay_unit only rides along with an active pay floor — a unit on its own
		// would filter listings by rate unit with no minimum, which seek/page reads
		// (parsePayUnit) and applies. Keep the two params coupled.
		if (value.payMin && value.payMin > 0) {
			next.set("pay_min", String(value.payMin));
			if (value.payUnit) next.set("pay_unit", value.payUnit);
			else next.delete("pay_unit");
		} else {
			next.delete("pay_min");
			next.delete("pay_unit");
		}
		// Any filter change invalidates the page cursor: page 3 of the old result
		// set is not page 3 of the new one.
		next.delete("page");
		const queryString = next.toString();
		router.push(queryString ? `${pathname}?${queryString}` : pathname);
		setFilterOpen(false);
	};

	const applyLane = (nextCategory: OpportunityCategory | null) => {
		pushParam("category", nextCategory);
		setLaneOpen(false);
	};

	// Triad-first quick filters — each flips a single URL param via pushParam.
	const toggleHousing = () => pushParam("housing", housing ? null : "1");
	const toggleMeals = () => pushParam("meals", meals ? null : "1");
	const selectLane = (lane: OpportunityCategory) =>
		pushParam("category", category === lane ? null : lane);

	// ── Card actions ────────────────────────────────────────────────────────
	//
	// Optimistic and best-effort, exactly like the deck: the write must never
	// block the interaction, and a failure leaves the card in its previous state
	// rather than claiming a save that did not happen.
	const requireAuth = useCallback((): boolean => {
		if (isAuthenticated) return false;
		router.push(`/sign-in?role=seeker&returnTo=${encodeURIComponent("/seek")}`);
		return true;
	}, [isAuthenticated, router]);

	const cardOverrides = useMemo<ListingCardPopupOverrides>(
		() => ({
			// onOpen is deliberately NOT overridden: the shared default opens Quick
			// Peek, which is the right affordance on a comparison surface (read four
			// listings without losing your filters), and it is also what fires
			// `listing_card_opened` via analyticsSurface below.
			onApply: (id) => {
				if (requireAuth()) return;
				router.push(`/listing/${id}?apply=1`);
			},
			onSave: (id) => {
				if (requireAuth()) return;
				setSavedIds((prev) => new Set(prev).add(id));
				captureEvent(SEEKER_DISCOVERY_EVENTS.listingSaved, { surface: "seek" });
				startAction(() => {
					void saveListingAction(id).catch(() => {
						setSavedIds((prev) => {
							const next = new Set(prev);
							next.delete(id);
							return next;
						});
					});
				});
			},
			onSkip: (id) => {
				if (requireAuth()) return;
				setSkippedIds((prev) => new Set(prev).add(id));
				captureEvent(SEEKER_DISCOVERY_EVENTS.listingSkipped, { surface: "seek" });
				startAction(() => {
					void passListingAction(id).catch(() => {
						setSkippedIds((prev) => {
							const next = new Set(prev);
							next.delete(id);
							return next;
						});
					});
				});
			},
		}),
		[requireAuth, router],
	);

	const getCardState = useCallback(
		(listing: DiscoveryListing) =>
			savedIds.has(listing.id)
				? ("saved" as const)
				: skippedIds.has(listing.id)
					? ("skipped" as const)
					: undefined,
		[savedIds, skippedIds],
	);

	// The honest count. We know this page exactly; we do NOT know the global
	// total (the query pages with .range and never asks for a count), so a
	// further page is announced as "more", never as a fabricated number.
	const countLabel = `${results.length} ${
		results.length === 1 ? "opportunity" : "opportunities"
	}${hasMorePages ? " on this page, more on the next" : ""}`;

	const removeHref = useCallback(
		(...keys: readonly string[]) => {
			const next = new URLSearchParams(searchParams.toString());
			for (const key of keys) next.delete(key);
			const queryString = next.toString();
			return queryString ? `${pathname}?${queryString}` : pathname;
		},
		[pathname, searchParams],
	);

	/** The current filter set, carried onto the map so the toggle keeps context. */
	const mapHref = useMemo(() => {
		const next = new URLSearchParams(searchParams.toString());
		next.delete("page");
		const queryString = next.toString();
		return queryString ? `/map?${queryString}` : "/map";
	}, [searchParams]);

	const emptyState = (() => {
		if (!hasActiveFilters) {
			return (
				<div className={styles.emptyWrap}>
					<EmptyState
						title="No opportunities are live right now"
						message="Hosts are building their seasons — the moment the first listing opens, it lands here with housing, meals, and pay stated up front. The map knows every place the moment it happens, and Swipe deals you one role at a time."
						actionLabel="Open the map"
						actionHref="/map"
					/>
				</div>
			);
		}
		// Recovery surface: every chip is a plain link that drops ONE filter param
		// (no client state), so the dead end names what screened everything out and
		// offers the way back.
		const removeChips: { label: string; href: string; icon?: IconKey }[] = [];
		if (query) {
			removeChips.push({ label: `“${query}”`, href: removeHref("q"), icon: "action.search" });
		}
		if (category) {
			removeChips.push({
				label: CATEGORY_LABEL[category as OpportunityCategory],
				href: removeHref("category"),
				icon: CATEGORY_ICON[category as OpportunityCategory],
			});
		}
		if (housing) {
			removeChips.push({ label: "Housing", href: removeHref("housing"), icon: "benefit.housing" });
		}
		if (meals) {
			removeChips.push({ label: "Meals", href: removeHref("meals"), icon: "benefit.meals" });
		}
		if (visaSupport) {
			removeChips.push({ label: "Visa support", href: removeHref("visa"), icon: "system.info" });
		}
		if (startRangeMonths) {
			removeChips.push({
				label: `Starts within ${startRangeMonths} mo`,
				href: removeHref("start_range"),
				icon: "status.begins",
			});
		}
		if (startAfter || startBefore) {
			removeChips.push({
				label: "Start-date window",
				href: removeHref("start_after", "start_before"),
				icon: "status.begins",
			});
		}
		if (payMin != null && payMin > 0) {
			removeChips.push({
				label: `$${payMin}${payUnit ? `/${payUnit}` : ""}+`,
				href: removeHref("pay_min", "pay_unit"),
				icon: "benefit.pay",
			});
		}
		if (location) {
			removeChips.push({ label: location, href: removeHref("location"), icon: "nav.map" });
		}
		const lanes = (["farm", "maritime", "remote", "seasonal"] as const).map((lane) => ({
			label: CATEGORY_LABEL[lane],
			href: `/seek?category=${lane}`,
			icon: CATEGORY_ICON[lane],
		}));
		const filterNoun = removeChips.length === 1 ? "filter" : "filters";
		return (
			<div className={styles.emptyWrap}>
				<EmptyState
					title={query ? `No matches for “${query}”` : "These filters came up empty"}
					message={
						removeChips.length > 0
							? `Every open opportunity is being screened out by your ${removeChips.length} active ${filterNoun}. Drop one below and the trail usually reopens.`
							: "Every open opportunity is being screened out by the current view. Loosen it below and the trail usually reopens."
					}
					filterChipsLabel="Remove a filter"
					filterChips={removeChips}
					suggestionsLabel="Or scout a lane"
					suggestions={lanes}
					actionLabel="Clear all filters"
					actionHref="/seek"
				/>
			</div>
		);
	})();

	// The header's written line claims only what this PAGE proves: the row
	// count is the fetched page, match counts are the stamped scores, and the
	// triad promise (housing/meals/pay stated up front) is the card contract
	// itself. No totals are invented — the server never fetched one.
	const matchesOnPage = listings.filter(
		(listing) => typeof listing.matchScore === "number",
	).length;
	const roleNoun = listings.length === 1 ? "open role" : "open roles";
	const seekLede =
		listings.length === 0
			? hasActiveFilters
				? "Nothing matches this search yet — loosen a filter and the roles come back."
				: "The marketplace opens with its first listing — hosts are building their seasons now."
			: matchesOnPage > 0
				? `Showing ${listings.length} ${roleNoun}${hasMorePages ? ", with more pages after this one" : ""} — ${matchesOnPage} match your profile, and every card states housing, meals, and pay up front.`
				: `Showing ${listings.length} ${roleNoun}${hasMorePages ? ", with more pages after this one" : ""} — every card states housing, meals, and pay up front.`;

	return (
		<section className={styles.wrap}>
			<header className={styles.header}>
				<p className={styles.eyebrow}>The marketplace</p>
				<h1 className={styles.heading}>
					Seek<span className={styles.titleMark}>.</span>
				</h1>
				<p className={styles.subheading}>{seekLede}</p>
			</header>

			<SavedSearches
				searches={savedSearches}
				currentFilters={currentFilters}
				currentLabel={currentLabel}
				canSave={hasActiveFilters}
			/>

			<div className={styles.filters}>
				<label className={styles.search}>
					<span className={styles.sortLabel}>Search</span>
					<input
						type="search"
						className={styles.searchInput}
						placeholder="Search opportunities, locations…"
						value={searchText}
						onChange={(event) => setSearchText(event.target.value)}
						aria-label="Search opportunities"
					/>
				</label>

				<div className={styles.controlRow}>
					<button
						type="button"
						className={styles.controlButton}
						onClick={() => setFilterOpen(true)}
						aria-haspopup="dialog"
					>
						<Icon name="action.filter" size={16} aria-hidden />
						<span className={styles.controlLabel}>Filter</span>
						{filterCount > 0 ? (
							<span className={styles.controlCount}>{filterCount}</span>
						) : null}
					</button>

					<button
						type="button"
						className={styles.controlButton}
						onClick={() => setLaneOpen(true)}
						aria-haspopup="dialog"
					>
						<Icon
							name={category ? CATEGORY_ICON[category as OpportunityCategory] : "nav.seek"}
							size={16}
							aria-hidden
						/>
						<span className={styles.controlLabel}>
							{category ? CATEGORY_LABEL[category as OpportunityCategory] : "Lane"}
						</span>
					</button>

					{/* Sort is page-scoped and labelled so — see SORT_OPTIONS. */}
					<label className={styles.selectField}>
						<span className={styles.sortLabel}>Sort this page</span>
						<select
							className={styles.select}
							value={sort}
							onChange={(event) => setSort(event.target.value as SortId)}
						>
							{SORT_OPTIONS.map((option) => (
								<option key={option.id} value={option.id}>
									{option.label}
								</option>
							))}
						</select>
					</label>

					<div className={styles.viewToggle} role="group" aria-label="Result layout">
						<button
							type="button"
							className={
								view === "grid"
									? `${styles.viewButton} ${styles.viewButtonActive}`
									: styles.viewButton
							}
							aria-pressed={view === "grid"}
							onClick={() => setView("grid")}
						>
							<Icon name="nav.seek" size={16} aria-hidden />
							Grid
						</button>
						<button
							type="button"
							className={
								view === "list"
									? `${styles.viewButton} ${styles.viewButtonActive}`
									: styles.viewButton
							}
							aria-pressed={view === "list"}
							onClick={() => setView("list")}
						>
							<Icon name="action.sort" size={16} aria-hidden />
							List
						</button>
					</div>

					<Link className={styles.mapLink} href={mapHref}>
						<Icon name="nav.map" size={16} aria-hidden />
						Map view
					</Link>
				</div>

				<SeekQuickFilters
					housing={housing}
					meals={meals}
					category={category ? (category as OpportunityCategory) : null}
					onToggleHousing={toggleHousing}
					onToggleMeals={toggleMeals}
					onSelectLane={selectLane}
					onMore={() => setFilterOpen(true)}
					moreCount={filterCount}
				/>

				{category || activeFilterChips.length > 0 ? (
					<div className={styles.activeBar}>
						{category ? (
							<span className={styles.activeChip}>
								<Icon name={CATEGORY_ICON[category as OpportunityCategory]} size={16} aria-hidden />
								{CATEGORY_LABEL[category as OpportunityCategory]}
							</span>
						) : null}
						{activeFilterChips.map((chip) => (
							<span key={`${chip.icon}-${chip.label}`} className={styles.activeChip}>
								<Icon name={chip.icon} size={16} aria-hidden />
								{chip.label}
							</span>
						))}
						<Link className={styles.clearButton} href={removeHref(
							"category",
							"housing",
							"meals",
							"visa",
							"start_range",
							"pay_min",
							"pay_unit",
							"location",
							"start_after",
							"start_before",
							"page",
						)}>
							Clear
						</Link>
					</div>
				) : null}
			</div>

			{/* Featured Employers Rail — always above the listings */}
			{featuredEmployers.length > 0 ? (
				<FeaturedEmployersRail employers={featuredEmployers} />
			) : null}

			{/* The result count is unconditional now: a search surface that only
			    counts when a filter is active leaves the seeker guessing on the
			    first, most common view. */}
			<p className={styles.count} role="status" aria-live="polite">
				{countLabel}
			</p>

			<ListingCardGrid
				listings={results}
				surface="discovery_feed"
				overrides={cardOverrides}
				analyticsSurface="seek"
				getCardState={getCardState}
				eagerCount={2}
				className={view === "list" ? styles.list : styles.grid}
				emptyState={emptyState}
			/>

			<SeekFilterPopup
				open={filterOpen}
				onClose={() => setFilterOpen(false)}
				value={{
					housing,
					meals,
					visaSupport,
					startRangeMonths,
					payMin,
					payUnit:
						payUnit === "hour" || payUnit === "day"
							? (payUnit as PayUnit)
							: undefined,
					location,
					startAfter,
					startBefore,
				}}
				onApply={applyFilters}
			/>

			<SeekSortPopup
				open={laneOpen}
				onClose={() => setLaneOpen(false)}
				category={category}
				onApply={applyLane}
			/>
		</section>
	);
}
