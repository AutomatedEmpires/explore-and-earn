"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
	MARKETPLACE_CATEGORIES,
	type CompensationUnit,
	type MarketplaceCategory,
} from "@explore-and-earn/contracts";
import { Chip, type IconKey } from "@explore-and-earn/ui";

import type { SearchListing } from "./listing";
import {
	ListingCard,
	ListingCardProvider,
	type DiscoveryListing,
} from "../discovery";
import type { DiscoveryCardSurface } from "@explore-and-earn/contracts";

// surface="search" is not part of DISCOVERY_CARD_SURFACES; use the closest real
// canonical value. Deliberately not "matched" (that triggers the match meter).
const SEARCH_SURFACE: DiscoveryCardSurface = "discovery_feed";

/**
 * Adapt the Search lane's own thin `SearchListing` view-model into the canonical
 * `DiscoveryListing` the shared <ListingCard> renders. Only fields the search
 * query actually carries are populated — `status: "live"` is honest (searchListings
 * only returns live rows), and structured data the search projection never fetched
 * (host id, pay insight, coordinates, begin/end dates) is left ABSENT rather than
 * fabricated. Because the host id is absent, the host tap routes to the listing
 * detail (see the provider override) instead of opening a match-all host popup.
 */
function searchListingToDiscovery(listing: SearchListing): DiscoveryListing {
	return {
		id: listing.id,
		title: listing.title,
		category: listing.category,
		location: listing.location,
		opportunityWindow: listing.opportunityWindow,
		status: "live",
		host: {
			name: listing.hostName,
			verified: listing.verifiedHost ?? false,
			tier: "none",
		},
		benefits: {
			housing: {
				provision: listing.benefits.housing.provision,
				summary: listing.benefits.housing.summary,
			},
			meals: {
				provision: listing.benefits.meals.provision,
				summary: listing.benefits.meals.summary,
			},
			pay: {
				provision: listing.benefits.pay.provision,
				summary: listing.benefits.pay.summary,
			},
		},
		conditionalBadges: listing.conditionalBadges,
		matchScore: listing.matchScore,
	};
}

const CATEGORY_LABELS: Record<MarketplaceCategory, string> = {
	farm: "Farm",
	maritime: "Maritime",
	remote: "Remote",
	seasonal: "Seasonal",
	mix: "Mix",
};

export interface SearchViewProps {
	listings: readonly SearchListing[];
	/** Current active text query (from URL). */
	query?: string;
	/** Currently selected category lane (from URL). */
	category?: MarketplaceCategory;
	/** Housing filter is active (from URL). */
	housing?: boolean;
	/** Meals filter is active (from URL). */
	meals?: boolean;
	/** Minimum pay in dollars (from URL). */
	payMin?: number;
	/** Pay unit filter (from URL). */
	payUnit?: CompensationUnit;
	/** Location substring filter (from URL). */
	location?: string;
	/** Earliest start date ISO string YYYY-MM-DD (from URL). */
	startAfter?: string;
	/** Latest start date ISO string YYYY-MM-DD (from URL). */
	startBefore?: string;
}

export function SearchView({
	listings,
	query: initialQuery = "",
	category,
	housing = false,
	meals = false,
	payMin,
	payUnit,
	location: initialLocation = "",
	startAfter = "",
	startBefore = "",
}: SearchViewProps) {
	const router = useRouter();

	// Adapt the thin search results to the canonical card view-model ONCE.
	const cards = useMemo(
		() => listings.map(searchListingToDiscovery),
		[listings],
	);

	// Local state for text/number/date inputs.
	// Changes navigate on form submit (Enter or the Search button).
	const [queryText, setQueryText] = useState(initialQuery ?? "");
	const [locationText, setLocationText] = useState(initialLocation ?? "");
	const [payMinText, setPayMinText] = useState(
		payMin != null ? String(payMin) : "",
	);
	const [payUnitValue, setPayUnitValue] = useState(payUnit ?? "");
	const [startAfterText, setStartAfterText] = useState(startAfter ?? "");
	const [startBeforeText, setStartBeforeText] = useState(startBefore ?? "");

	/**
	 * Build a /search URL incorporating local input state plus any overrides.
	 * Used by both the form submit handler and the immediate-navigate chip
	 * handlers — so clicking a chip also commits any typed-but-not-submitted
	 * text values.
	 */
	function buildUrl(
		overrides: Partial<{
			q?: string;
			category?: string;
			housing?: boolean;
			meals?: boolean;
			pay_min?: string;
			pay_unit?: string;
			location?: string;
			start_after?: string;
			start_before?: string;
		}>,
	): string {
		const merged = {
			q: queryText || undefined,
			category: category || undefined,
			housing: housing || undefined,
			meals: meals || undefined,
			pay_min: payMinText || undefined,
			pay_unit: payUnitValue || undefined,
			location: locationText || undefined,
			start_after: startAfterText || undefined,
			start_before: startBeforeText || undefined,
			...overrides,
		};

		const sp = new URLSearchParams();
		if (merged.q) sp.set("q", merged.q);
		if (merged.category) sp.set("category", merged.category);
		if (merged.housing) sp.set("housing", "1");
		if (merged.meals) sp.set("meals", "1");
		if (merged.pay_min) sp.set("pay_min", merged.pay_min);
		if (merged.pay_unit) sp.set("pay_unit", merged.pay_unit);
		if (merged.location) sp.set("location", merged.location);
		if (merged.start_after) sp.set("start_after", merged.start_after);
		if (merged.start_before) sp.set("start_before", merged.start_before);

		const qs = sp.toString();
		return qs ? `/search?${qs}` : "/search";
	}

	// Category chips: single-select, navigate immediately on click.
	const toggleCategory = (cat: MarketplaceCategory) => {
		router.push(buildUrl({ category: category === cat ? undefined : cat }));
	};

	// Benefit chips: boolean toggles, navigate immediately on click.
	const toggleHousing = () => {
		router.push(buildUrl({ housing: !housing }));
	};
	const toggleMeals = () => {
		router.push(buildUrl({ meals: !meals }));
	};

	// Form submit: navigate with all current input values.
	const handleSubmit = (event: FormEvent) => {
		event.preventDefault();
		router.push(
			buildUrl({
				q: queryText || undefined,
				location: locationText || undefined,
				pay_min: payMinText || undefined,
				pay_unit: payUnitValue || undefined,
				start_after: startAfterText || undefined,
				start_before: startBeforeText || undefined,
			}),
		);
	};

	return (
		<section className="ee-search">
			<form className="ee-search__form" onSubmit={handleSubmit} role="search">
				<header className="ee-search__header">
					<h1 className="ee-search__title">Search opportunities</h1>

					<div className="ee-search__field">
						<label className="ee-search__label" htmlFor="ee-search-query">
							Search
						</label>
						<input
							id="ee-search-query"
							className="ee-search__input"
							type="search"
							inputMode="search"
							placeholder="Search by role, host, or place"
							value={queryText}
							onChange={(event) => setQueryText(event.target.value)}
						/>
					</div>

					<div className="ee-search__field">
						<label
							className="ee-search__label"
							htmlFor="ee-search-location"
						>
							Location
						</label>
						<input
							id="ee-search-location"
							className="ee-search__input"
							type="text"
							placeholder="City, state, or country"
							value={locationText}
							onChange={(event) => setLocationText(event.target.value)}
						/>
					</div>

					<div className="ee-search__field-row">
						<div className="ee-search__field">
							<label
								className="ee-search__label"
								htmlFor="ee-search-start-after"
							>
								Starts after
							</label>
							<input
								id="ee-search-start-after"
								className="ee-search__input"
								type="date"
								value={startAfterText}
								onChange={(event) => setStartAfterText(event.target.value)}
							/>
						</div>
						<div className="ee-search__field">
							<label
								className="ee-search__label"
								htmlFor="ee-search-start-before"
							>
								Starts before
							</label>
							<input
								id="ee-search-start-before"
								className="ee-search__input"
								type="date"
								value={startBeforeText}
								onChange={(event) => setStartBeforeText(event.target.value)}
							/>
						</div>
					</div>

					<div className="ee-search__pay-row">
						<div className="ee-search__field">
							<label
								className="ee-search__label"
								htmlFor="ee-search-pay-min"
							>
								Min pay
							</label>
							<input
								id="ee-search-pay-min"
								className="ee-search__input"
								type="number"
								min="0"
								step="1"
								placeholder="e.g. 20"
								value={payMinText}
								onChange={(event) => setPayMinText(event.target.value)}
							/>
						</div>
						<div className="ee-search__field">
							<label
								className="ee-search__label"
								htmlFor="ee-search-pay-unit"
							>
								Per
							</label>
							<select
								id="ee-search-pay-unit"
								className="ee-search__input ee-search__select"
								value={payUnitValue}
								onChange={(event) => setPayUnitValue(event.target.value)}
							>
								{/* Intentionally limited to the two time-rate units that are
								    meaningful as search filters. Other CompensationUnit values
								    (week, month, year, stipend, exchange, other) are not
								    commonly used as filter criteria. */}
								<option value="">Any</option>
								<option value="hour">Hour</option>
								<option value="day">Day</option>
							</select>
						</div>
					</div>

					<button className="ee-search__submit" type="submit">
						Search
					</button>
				</header>
			</form>

			<div
				className="ee-search__filters"
				role="group"
				aria-label="Filter by category"
			>
				<span className="ee-search__filters-label">Category</span>
				<div className="ee-search__chip-row">
					{MARKETPLACE_CATEGORIES.map((cat) => {
						const selected = category === cat;
						return (
							<button
								key={cat}
								type="button"
								className="ee-search__chip-button"
								data-accent={cat}
								aria-pressed={selected}
								onClick={() => toggleCategory(cat)}
							>
								<Chip
									icon={`category.${cat}` as IconKey}
									selected={selected}
								>
									{CATEGORY_LABELS[cat]}
								</Chip>
							</button>
						);
					})}
				</div>
			</div>

			<div
				className="ee-search__filters"
				role="group"
				aria-label="Filter by benefit"
			>
				<span className="ee-search__filters-label">Benefits</span>
				<div className="ee-search__chip-row">
					<button
						type="button"
						className="ee-search__chip-button"
						data-benefit="housing"
						aria-pressed={housing}
						onClick={toggleHousing}
					>
						<Chip icon={"benefit.housing" as IconKey} selected={housing}>
							Housing
						</Chip>
					</button>
					<button
						type="button"
						className="ee-search__chip-button"
						data-benefit="meals"
						aria-pressed={meals}
						onClick={toggleMeals}
					>
						<Chip icon={"benefit.meals" as IconKey} selected={meals}>
							Meals
						</Chip>
					</button>
				</div>
			</div>

			<div className="ee-search__results" aria-live="polite">
				<p className="ee-search__count">
					{listings.length === 0
						? "No matches"
						: `${listings.length} ${listings.length === 1 ? "result" : "results"}`}
				</p>

				{listings.length === 0 ? (
					<div className="ee-search__empty" role="status">
						<p className="ee-search__empty-title">
							No opportunities match your filters
						</p>
						<p className="ee-search__empty-body">
							Try removing a benefit or category filter, or search a different
							term.
						</p>
					</div>
				) : (
					<ListingCardProvider
						listings={cards}
						overrides={{
							onApply: (id) => router.push(`/listing/${id}`),
							// Search rows carry no host id — route the host tap to
							// the listing detail rather than open a host popup that
							// would (mis)match every search result.
							onHostClick: (id) => router.push(`/listing/${id}`),
						}}
					>
						<ul className="ee-search__list">
							{cards.map((listing) => (
								<li key={listing.id} className="ee-search__list-item">
									<ListingCard listing={listing} surface={SEARCH_SURFACE} />
								</li>
							))}
						</ul>
					</ListingCardProvider>
				)}
			</div>
		</section>
	);
}
