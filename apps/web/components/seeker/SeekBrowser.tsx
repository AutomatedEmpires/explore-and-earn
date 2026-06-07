"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { OpportunityCategory } from "@explore-and-earn/contracts";
import { DiscoveryCard, Icon, type IconKey } from "@explore-and-earn/ui";

import {
	BenefitBucketDrawer,
	CATEGORY_ICON,
	CATEGORY_LABEL,
	EmptyState,
	HostProfilePopup,
	QuickPeekDrawer,
	ReportListingDrawer,
	toDiscoveryCardData,
	type BenefitBucket,
	type DiscoveryListing,
} from "../discovery";
import styles from "./SeekBrowser.module.css";

type BenefitToggleKey = "housing" | "meals";
type SortKey = "match" | "title";

const CATEGORY_ORDER: readonly OpportunityCategory[] = [
	"farm",
	"maritime",
	"remote",
	"seasonal",
	"mix",
];

const SORT_KEYS: readonly SortKey[] = ["match", "title"];

const BENEFIT_FILTERS: readonly {
	readonly key: BenefitToggleKey;
	readonly label: string;
	readonly icon: IconKey;
}[] = [
	{ key: "housing", label: "Housing", icon: "benefit.housing" },
	{ key: "meals", label: "Meals", icon: "benefit.meals" },
];

const SORTS: readonly { readonly key: SortKey; readonly label: string }[] = [
	{ key: "match", label: "Best match" },
	{ key: "title", label: "A–Z" },
];

const SEARCH_DEBOUNCE_MS = 400;

function parseSort(value: string | undefined): SortKey {
	return SORT_KEYS.includes(value as SortKey) ? (value as SortKey) : "match";
}

export interface SeekBrowserProps {
	readonly listings: readonly DiscoveryListing[];
	readonly query?: string;
	readonly category?: string;
	readonly housing?: boolean;
	readonly meals?: boolean;
	readonly location?: string;
	readonly payMin?: number;
	readonly startAfter?: string;
	readonly startBefore?: string;
}

/**
 * SeekBrowser — the browsable Seek tab. All filter state (text query, category,
 * housing/meals, location, pay floor, start-date range) lives in the URL query
 * string: the server page parses it, runs searchListings, and hands the
 * already-filtered listings here. The controls below only navigate — toggling a
 * chip, typing in the search box, or picking a start-date pushes a new URL,
 * which re-renders the server page, so a filtered view is shareable and
 * bookmarkable. Sort is a client-only reordering of the returned rows. The
 * drawers (QuickPeek / HostProfile / BenefitBucket / Report) are unchanged.
 */
export function SeekBrowser({
	listings,
	query,
	category,
	housing = false,
	meals = false,
	location,
	payMin,
	startAfter,
	startBefore,
}: SeekBrowserProps) {
	const pathname = usePathname();
	const router = useRouter();
	const searchParams = useSearchParams();

	const [searchText, setSearchText] = useState<string>(query ?? "");
	const [sort, setSort] = useState<SortKey>(() =>
		parseSort(searchParams.get("sort") ?? undefined),
	);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [activeHostId, setActiveHostId] = useState<string | null>(null);
	const [activeBenefit, setActiveBenefit] = useState<{
		readonly id: string;
		readonly bucket: BenefitBucket;
	} | null>(null);
	const [reportId, setReportId] = useState<string | null>(null);

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
			// A new search resets to the first page.
			next.delete("page");
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
		// Any filter change resets pagination to the first page.
		if (key !== "page") {
			next.delete("page");
		}
		const queryString = next.toString();
		router.push(queryString ? `${pathname}?${queryString}` : pathname);
	};

	const toggleCategory = (key: OpportunityCategory) => {
		pushParam("category", category === key ? null : key);
	};

	const toggleBenefit = (key: BenefitToggleKey) => {
		const isOn = key === "housing" ? housing : meals;
		pushParam(key, isOn ? null : "1");
	};

	const results = useMemo(() => {
		const sorted = [...listings];
		if (sort === "match") {
			sorted.sort((a, b) => (b.matchScore ?? -1) - (a.matchScore ?? -1));
		} else {
			sorted.sort((a, b) => a.title.localeCompare(b.title));
		}
		return sorted;
	}, [listings, sort]);

	const activeListing = useMemo(
		() => listings.find((listing) => listing.id === activeId) ?? null,
		[listings, activeId],
	);

	const activeHost = useMemo(
		() => listings.find((listing) => listing.id === activeHostId)?.host ?? null,
		[listings, activeHostId],
	);

	const activeBenefitListing = useMemo(
		() => listings.find((listing) => listing.id === activeBenefit?.id) ?? null,
		[listings, activeBenefit],
	);

	const activeReportListing = useMemo(
		() => listings.find((listing) => listing.id === reportId) ?? null,
		[listings, reportId],
	);

	const hasActiveFilters =
		Boolean(query) ||
		Boolean(category) ||
		housing ||
		meals ||
		Boolean(location) ||
		payMin != null ||
		Boolean(startAfter) ||
		Boolean(startBefore);

	const countLabel = `${results.length} ${
		results.length === 1 ? "opportunity" : "opportunities"
	}`;

	return (
		<section className={styles.wrap}>
			<header className={styles.header}>
				<h1 className={styles.heading}>Seek opportunities</h1>
				<p className={styles.subheading}>
					Browse every open work-travel opportunity — housing, meals, and pay
					from hosts worldwide.
				</p>
			</header>

			<div className={styles.filters}>
				<label className={styles.sort}>
					<span className={styles.sortLabel}>Search</span>
					<input
						type="search"
						className={styles.sortSelect}
						placeholder="Search opportunities, locations…"
						value={searchText}
						onChange={(event) => setSearchText(event.target.value)}
						aria-label="Search opportunities"
					/>
				</label>

				<div
					className={styles.filterGroup}
					role="group"
					aria-label="Filter by category"
				>
					<button
						type="button"
						className={
							!category ? `${styles.chip} ${styles.chipSelected}` : styles.chip
						}
						aria-pressed={!category}
						onClick={() => pushParam("category", null)}
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
								onClick={() => toggleCategory(key)}
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
						const isSelected = key === "housing" ? housing : meals;
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

				<div
					className={styles.filterGroup}
					role="group"
					aria-label="Filter by start date"
				>
					<label className={styles.dateField}>
						<span className={styles.dateLabel}>Starts after</span>
						<input
							type="date"
							className={styles.dateInput}
							value={startAfter ?? ""}
							max={startBefore || undefined}
							onChange={(event) =>
								pushParam("start_after", event.target.value || null)
							}
							aria-label="Starts on or after"
						/>
					</label>
					<label className={styles.dateField}>
						<span className={styles.dateLabel}>Starts before</span>
						<input
							type="date"
							className={styles.dateInput}
							value={startBefore ?? ""}
							min={startAfter || undefined}
							onChange={(event) =>
								pushParam("start_before", event.target.value || null)
							}
							aria-label="Starts on or before"
						/>
					</label>
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
				<div className={styles.emptyWrap}>
					<EmptyState
						title={
							query ? `No listings match “${query}”` : "No matches with those filters"
						}
						message={
							query
								? "Try a different search term or clear your filters to see more opportunities."
								: "Try removing a filter to see more opportunities."
						}
					/>
					{hasActiveFilters ? (
						<Link className={styles.clearLink} href="/seek">
							Clear filters
						</Link>
					) : null}
				</div>
			) : (
				<div className={styles.grid}>
					{results.map((listing) => (
						<DiscoveryCard
							key={listing.id}
							data={toDiscoveryCardData(listing)}
							surface="discovery_feed"
							onOpen={(id) => setActiveId(id)}
							onHostClick={(id) => setActiveHostId(id)}
							onHousingClick={(id) =>
								setActiveBenefit({ id, bucket: "housing" })
							}
							onMealsClick={(id) => setActiveBenefit({ id, bucket: "meals" })}
							onLocationClick={(id) => router.push(`/map?focus=${id}`)}
							onReport={(id) => setReportId(id)}
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

			<BenefitBucketDrawer
				listing={activeBenefitListing}
				bucket={activeBenefit?.bucket ?? null}
				onClose={() => setActiveBenefit(null)}
			/>

			<ReportListingDrawer
				listing={activeReportListing}
				onClose={() => setReportId(null)}
			/>
		</section>
	);
}
