"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import type { OpportunityCategory } from "@explore-and-earn/contracts";
import { DiscoveryCard, Icon, type IconKey } from "@explore-and-earn/ui";

import {
	CATEGORY_ICON,
	CATEGORY_LABEL,
	EmptyState,
	HostProfilePopup,
	QuickPeekDrawer,
	toDiscoveryCardData,
	type DiscoveryListing,
} from "../discovery";
import styles from "./SeekBrowser.module.css";

type CategoryFilter = OpportunityCategory | "all";
type BenefitKey = "housing" | "meals" | "pay";
type SortKey = "match" | "title";

const CATEGORY_ORDER: readonly OpportunityCategory[] = [
	"farm",
	"maritime",
	"remote",
	"seasonal",
	"mix",
];

const CATEGORY_FILTERS: readonly CategoryFilter[] = ["all", ...CATEGORY_ORDER];
const BENEFIT_KEYS: readonly BenefitKey[] = ["housing", "meals", "pay"];
const SORT_KEYS: readonly SortKey[] = ["match", "title"];

const BENEFIT_FILTERS: readonly {
	readonly key: BenefitKey;
	readonly label: string;
	readonly icon: IconKey;
}[] = [
	{ key: "housing", label: "Housing", icon: "benefit.housing" },
	{ key: "meals", label: "Meals", icon: "benefit.meals" },
	{ key: "pay", label: "Pay", icon: "benefit.pay" },
];

const SORTS: readonly { readonly key: SortKey; readonly label: string }[] = [
	{ key: "match", label: "Best match" },
	{ key: "title", label: "A\u2013Z" },
];

function parseCategory(value: string | undefined): CategoryFilter {
	return CATEGORY_FILTERS.includes(value as CategoryFilter)
		? (value as CategoryFilter)
		: "all";
}

function parseBenefits(value: string | undefined): readonly BenefitKey[] {
	if (!value) {
		return [];
	}
	const requested = value.split(",").map((entry) => entry.trim());
	return BENEFIT_KEYS.filter((key) => requested.includes(key));
}

function parseSort(value: string | undefined): SortKey {
	return SORT_KEYS.includes(value as SortKey) ? (value as SortKey) : "match";
}

export interface SeekBrowserProps {
	readonly listings: readonly DiscoveryListing[];
	readonly initialCategory?: string;
	readonly initialBenefits?: string;
	readonly initialSort?: string;
}

/**
 * SeekBrowser \u2014 the browsable Seek tab. Client-side category + benefit
 * filters and sort layered over the single canonical DiscoveryCard. Owns no
 * data model: it filters/sorts the DiscoveryListing view-model and renders the
 * same card every other seeker surface uses. The discovery-lane DiscoveryFeed
 * is left untouched so the two surfaces never collide.
 *
 * Filter + sort state is hydrated from the URL query (category / benefits /
 * sort) and mirrored back with history.replaceState, so a filtered view is
 * shareable and bookmarkable without a server round-trip per toggle. Tapping a
 * card title opens the lane-local QuickPeekDrawer with the full listing detail;
 * tapping the host identity circle opens the HostProfilePopup.
 */
export function SeekBrowser({
	listings,
	initialCategory,
	initialBenefits,
	initialSort,
}: SeekBrowserProps) {
	const pathname = usePathname();
	const [category, setCategory] = useState<CategoryFilter>(() =>
		parseCategory(initialCategory),
	);
	const [benefits, setBenefits] = useState<readonly BenefitKey[]>(() =>
		parseBenefits(initialBenefits),
	);
	const [sort, setSort] = useState<SortKey>(() => parseSort(initialSort));
	const [activeId, setActiveId] = useState<string | null>(null);
	const [activeHostId, setActiveHostId] = useState<string | null>(null);

	const toggleBenefit = (key: BenefitKey) => {
		setBenefits((prev) =>
			prev.includes(key) ? prev.filter((entry) => entry !== key) : [...prev, key],
		);
	};

	useEffect(() => {
		const params = new URLSearchParams();
		if (category !== "all") {
			params.set("category", category);
		}
		const selectedBenefits = BENEFIT_KEYS.filter((key) =>
			benefits.includes(key),
		);
		if (selectedBenefits.length > 0) {
			params.set("benefits", selectedBenefits.join(","));
		}
		if (sort !== "match") {
			params.set("sort", sort);
		}
		const query = params.toString();
		window.history.replaceState(
			null,
			"",
			query ? `${pathname}?${query}` : pathname,
		);
	}, [category, benefits, sort, pathname]);

	const results = useMemo(() => {
		const filtered = listings.filter((listing) => {
			if (category !== "all" && listing.category !== category) {
				return false;
			}
			return benefits.every(
				(key) => listing.benefits[key].provision === "provided",
			);
		});
		const sorted = [...filtered];
		if (sort === "match") {
			sorted.sort((a, b) => (b.matchScore ?? -1) - (a.matchScore ?? -1));
		} else {
			sorted.sort((a, b) => a.title.localeCompare(b.title));
		}
		return sorted;
	}, [listings, category, benefits, sort]);

	const activeListing = useMemo(
		() => listings.find((listing) => listing.id === activeId) ?? null,
		[listings, activeId],
	);

	const activeHost = useMemo(
		() => listings.find((listing) => listing.id === activeHostId)?.host ?? null,
		[listings, activeHostId],
	);

	const countLabel = `${results.length} ${
		results.length === 1 ? "opportunity" : "opportunities"
	}`;

	return (
		<section className={styles.wrap}>
			<header className={styles.header}>
				<h1 className={styles.heading}>Seek opportunities</h1>
				<p className={styles.subheading}>
					Browse every open work-travel opportunity \u2014 housing, meals, and pay
					from hosts worldwide.
				</p>
			</header>

			<div className={styles.filters}>
				<div
					className={styles.filterGroup}
					role="group"
					aria-label="Filter by category"
				>
					<button
						type="button"
						className={
							category === "all"
								? `${styles.chip} ${styles.chipSelected}`
								: styles.chip
						}
						aria-pressed={category === "all"}
						onClick={() => setCategory("all")}
					>
						<span className={styles.chipLabel}>All</span>
					</button>
					{CATEGORY_ORDER.map((key) => {
						const isSelected = category === key;
						return (
							<button
								key={key}
								type="button"
								className={
									isSelected ? `${styles.chip} ${styles.chipSelected}` : styles.chip
								}
								aria-pressed={isSelected}
								onClick={() => setCategory(isSelected ? "all" : key)}
							>
								<Icon name={CATEGORY_ICON[key]} size={16} aria-hidden />
								<span className={styles.chipLabel}>{CATEGORY_LABEL[key]}</span>
							</button>
						);
					})}
				</div>

				<div
					className={styles.filterGroup}
					role="group"
					aria-label="Filter by what is provided"
				>
					{BENEFIT_FILTERS.map(({ key, label, icon }) => {
						const isSelected = benefits.includes(key);
						return (
							<button
								key={key}
								type="button"
								className={
									isSelected ? `${styles.chip} ${styles.chipSelected}` : styles.chip
								}
								aria-pressed={isSelected}
								onClick={() => toggleBenefit(key)}
							>
								<Icon name={icon} size={16} aria-hidden />
								<span className={styles.chipLabel}>{label} provided</span>
							</button>
						);
					})}
				</div>

				<label className={styles.sort}>
					<span className={styles.sortLabel}>Sort</span>
					<select
						className={styles.sortSelect}
						value={sort}
						onChange={(event) => setSort(event.target.value as SortKey)}
					>
						{SORTS.map((option) => (
							<option key={option.key} value={option.key}>
								{option.label}
							</option>
						))}
					</select>
				</label>
			</div>

			<p className={styles.count} role="status" aria-live="polite">
				{countLabel}
			</p>

			{results.length === 0 ? (
				<EmptyState
					title="No matches with those filters"
					message="Try removing a filter to see more opportunities."
				/>
			) : (
				<div className={styles.grid}>
					{results.map((listing) => (
						<DiscoveryCard
							key={listing.id}
							data={toDiscoveryCardData(listing)}
							surface="discovery_feed"
							onOpen={(id) => setActiveId(id)}
							onHostClick={(id) => setActiveHostId(id)}
						/>
					))}
				</div>
			)}

			<QuickPeekDrawer
				listing={activeListing}
				onClose={() => setActiveId(null)}
			/>

			<HostProfilePopup
				host={activeHost}
				listings={listings}
				onClose={() => setActiveHostId(null)}
				onSelectListing={(id) => {
					setActiveHostId(null);
					setActiveId(id);
				}}
			/>
		</section>
	);
}
