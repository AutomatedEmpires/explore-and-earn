"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
	BENEFIT_KINDS,
	MARKETPLACE_CATEGORIES,
	type BenefitKind,
	type DiscoveryCardSurface,
	type MarketplaceCategory,
} from "@explore-and-earn/contracts";
import { Chip, DiscoveryCard, type IconKey } from "@explore-and-earn/ui";

import {
	EMPTY_FILTERS,
	filterListings,
	toDiscoveryCardData,
	type SearchFilters,
} from "./filtering";
import { SEARCH_FIXTURES } from "./fixtures";

// surface="search" is not part of DISCOVERY_CARD_SURFACES; use the closest real
// canonical value. Deliberately not "matched" (that triggers the match meter).
const SEARCH_SURFACE: DiscoveryCardSurface = "discovery_feed";

const CATEGORY_LABELS: Record<MarketplaceCategory, string> = {
	farm: "Farm",
	maritime: "Maritime",
	remote: "Remote",
	seasonal: "Seasonal",
	mix: "Mix",
};

const BENEFIT_LABELS: Record<BenefitKind, string> = {
	housing: "Housing",
	meals: "Meals",
	pay: "Pay",
};

export function SearchView() {
	const router = useRouter();
	const [filters, setFilters] = useState<SearchFilters>(EMPTY_FILTERS);

	const results = useMemo(
		() => filterListings(SEARCH_FIXTURES, filters),
		[filters],
	);

	const toggleCategory = (category: MarketplaceCategory) =>
		setFilters((current) => ({
			...current,
			categories: current.categories.includes(category)
				? current.categories.filter((value) => value !== category)
				: [...current.categories, category],
		}));

	const toggleBenefit = (kind: BenefitKind) =>
		setFilters((current) => ({
			...current,
			benefits: current.benefits.includes(kind)
				? current.benefits.filter((value) => value !== kind)
				: [...current.benefits, kind],
		}));

	return (
		<section className="ee-search">
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
						value={filters.query}
						onChange={(event) =>
							setFilters((current) => ({ ...current, query: event.target.value }))
						}
					/>
				</div>
			</header>

			<div
				className="ee-search__filters"
				role="group"
				aria-label="Filter by category"
			>
				<span className="ee-search__filters-label">Category</span>
				<div className="ee-search__chip-row">
					{MARKETPLACE_CATEGORIES.map((category) => {
						const selected = filters.categories.includes(category);
						return (
							<button
								key={category}
								type="button"
								className="ee-search__chip-button"
								data-accent={category}
								aria-pressed={selected}
								onClick={() => toggleCategory(category)}
							>
								<Chip
									icon={`category.${category}` as IconKey}
									selected={selected}
								>
									{CATEGORY_LABELS[category]}
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
					{BENEFIT_KINDS.map((kind) => {
						const selected = filters.benefits.includes(kind);
						return (
							<button
								key={kind}
								type="button"
								className="ee-search__chip-button"
								data-benefit={kind}
								aria-pressed={selected}
								onClick={() => toggleBenefit(kind)}
							>
								<Chip icon={`benefit.${kind}` as IconKey} selected={selected}>
									{BENEFIT_LABELS[kind]}
								</Chip>
							</button>
						);
					})}
				</div>
			</div>

			<div className="ee-search__results" aria-live="polite">
				<p className="ee-search__count">
					{results.length === 0
						? "No matches"
						: `${results.length} ${results.length === 1 ? "result" : "results"}`}
				</p>

				{results.length === 0 ? (
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
					<ul className="ee-search__list">
						{results.map((listing) => (
							<li key={listing.id} className="ee-search__list-item">
								<DiscoveryCard
									data={toDiscoveryCardData(listing)}
									surface={SEARCH_SURFACE}
									onOpen={(id) => router.push(`/listing/${id}`)}
									onApply={(id) => router.push(`/listing/${id}`)}
									onLocationClick={(id) => router.push(`/map?focus=${id}`)}
								/>
							</li>
						))}
					</ul>
				)}
			</div>
		</section>
	);
}
