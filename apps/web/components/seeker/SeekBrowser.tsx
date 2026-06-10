"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type {
	CompensationUnit,
	OpportunityCategory,
} from "@explore-and-earn/contracts";
import { DiscoveryCard, Icon, type IconKey } from "@explore-and-earn/ui";

import {
	BenefitTrustModal,
	CATEGORY_ICON,
	CATEGORY_LABEL,
	EmptyState,
	HostProfilePopup,
	PayDetailsDrawer,
	QuickPeekDrawer,
	ReportListingDrawer,
	toDiscoveryCardData,
	type BenefitKind,
	type DiscoveryListing,
} from "../discovery";
import {
	FeaturedEmployersRail,
	type FeaturedEmployer,
} from "../public/FeaturedEmployersRail";
import styles from "./SeekBrowser.module.css";
import { SeekFilterPopup, type SeekFilterPopupValue } from "./SeekFilterPopup";
import { SeekSortPopup } from "./SeekSortPopup";

type StartRangeMonths = 1 | 3 | 6;
type PayUnit = Extract<CompensationUnit, "hour" | "day">;

type ActiveBenefit = { readonly id: string; readonly bucket: BenefitKind };

/** Extracted to avoid duplicating the 30-line DiscoveryCard map block. */
function ListingSection({
	id,
	title,
	listings,
	styles: s,
	onOpen,
	onHostClick,
	onBenefit,
	onPay,
	onLocation,
	onReport,
}: {
	id: string;
	title: string;
	listings: readonly DiscoveryListing[];
	styles: Record<string, string>;
	onOpen: (id: string) => void;
	onHostClick: (id: string) => void;
	onBenefit: (v: ActiveBenefit) => void;
	onPay: (id: string) => void;
	onLocation: (id: string) => void;
	onReport: (id: string) => void;
}) {
	return (
		<section className={s.listingSection} aria-labelledby={id}>
			<header className={s.listingSectionHead}>
				<h2 id={id} className={s.listingSectionTitle}>{title}</h2>
				<p className={s.listingSectionCount}>
					{listings.length}&nbsp;{listings.length === 1 ? "opportunity" : "opportunities"}
				</p>
			</header>
			<div className={s.grid}>
				{listings.map((listing) => (
					<DiscoveryCard
						key={listing.id}
						data={toDiscoveryCardData(listing)}
						surface="discovery_feed"
						onOpen={onOpen}
						onHostClick={onHostClick}
						onHousingClick={(lid) => onBenefit({ id: lid, bucket: "housing" })}
						onMealsClick={(lid) => onBenefit({ id: lid, bucket: "meals" })}
						onPayClick={onPay}
						onLocationClick={onLocation}
						onReport={onReport}
					/>
				))}
			</div>
		</section>
	);
}

const SEARCH_DEBOUNCE_MS = 400;

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
}

/**
 * SeekBrowser \u2014 the browsable Seek tab. All filter state (text query, category,
 * housing/meals, location, pay floor) lives in the URL query string: the server
 * page parses it, runs searchListings, and hands the already-filtered listings
 * here. The controls below only navigate \u2014 toggling a chip or typing in the
 * search box pushes a new URL, which re-renders the server page, so a filtered
 * view is shareable and bookmarkable. Sort is a client-only reordering of the
 * returned rows. The drawers (QuickPeek / HostProfile / BenefitBucket / Report)
 * are unchanged.
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
}: SeekBrowserProps) {
	const pathname = usePathname();
	const router = useRouter();
	const searchParams = useSearchParams();

	const [searchText, setSearchText] = useState<string>(query ?? "");
	const [filterOpen, setFilterOpen] = useState(false);
	const [sortOpen, setSortOpen] = useState(false);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [activeHostId, setActiveHostId] = useState<string | null>(null);
	const [activeBenefit, setActiveBenefit] = useState<ActiveBenefit | null>(null);
	const [activePayId, setActivePayId] = useState<string | null>(null);
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

	const results = listings;

	// Split results into featured (boosted / verified hosts) and the rest.
	// Only shown when no active filters; when filtering, a single flat grid
	// is more useful than an artificial featured/all split.
	const featuredResults = useMemo(
		() =>
			results.filter(
				(l) =>
					l.conditionalBadges?.includes("boosted") || l.host.verified,
			),
		[results],
	);
	const restResults = useMemo(
		() =>
			results.filter(
				(l) =>
					!l.conditionalBadges?.includes("boosted") && !l.host.verified,
			),
		[results],
	);

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

	const activePayListing = useMemo(
		() => listings.find((listing) => listing.id === activePayId) ?? null,
		[listings, activePayId],
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
		visaSupport ||
		Boolean(startRangeMonths) ||
		Boolean(location) ||
		payMin != null ||
		Boolean(payUnit);

	const activeFilterChips = useMemo(() => {
		const chips: { label: string; icon: IconKey }[] = [];
		if (startRangeMonths) {
			chips.push({ label: `${startRangeMonths} mo`, icon: "system.info" });
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
	}, [housing, location, meals, payMin, payUnit, startRangeMonths, visaSupport]);

	const filterCount = activeFilterChips.length;

	const applyFilters = (value: SeekFilterPopupValue) => {
		const next = new URLSearchParams(searchParams.toString());
		if (value.housing) next.set("housing", "1");
		else next.delete("housing");
		if (value.meals) next.set("meals", "1");
		else next.delete("meals");
		if (value.visaSupport) next.set("visa", "1");
		else next.delete("visa");
		if (value.startRangeMonths) next.set("start_range", String(value.startRangeMonths));
		else next.delete("start_range");
		if (value.payMin && value.payMin > 0) next.set("pay_min", String(value.payMin));
		else next.delete("pay_min");
		if (value.payUnit) next.set("pay_unit", value.payUnit);
		else next.delete("pay_unit");
		const queryString = next.toString();
		router.push(queryString ? `${pathname}?${queryString}` : pathname);
		setFilterOpen(false);
	};

	const applySort = (nextCategory: OpportunityCategory | null) => {
		pushParam("category", nextCategory);
		setSortOpen(false);
	};

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
				<label className={styles.search}>
					<span className={styles.sortLabel}>Search</span>
					<input
						type="search"
						className={styles.searchInput}
						placeholder="Search opportunities, locations\u2026"
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
						onClick={() => setSortOpen(true)}
					>
						<Icon
							name={
								category ? CATEGORY_ICON[category as OpportunityCategory] : "action.sort"
							}
							size={16}
							aria-hidden
						/>
						<span className={styles.controlLabel}>
							{category ? CATEGORY_LABEL[category as OpportunityCategory] : "Sort"}
						</span>
					</button>
				</div>

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
						<button
							type="button"
							className={styles.clearButton}
							onClick={() => {
								const next = new URLSearchParams(searchParams.toString());
								next.delete("category");
								next.delete("housing");
								next.delete("meals");
								next.delete("visa");
								next.delete("start_range");
								next.delete("pay_min");
								next.delete("pay_unit");
								next.delete("location");
								const queryString = next.toString();
								router.push(queryString ? `${pathname}?${queryString}` : pathname);
							}}
						>
							Clear
						</button>
					</div>
				) : null}
			</div>

			{/* \u2500\u2500 Featured Employers Rail \u2014 always above the listings \u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
			{featuredEmployers.length > 0 ? (
				<FeaturedEmployersRail employers={featuredEmployers} />
			) : null}

			{/* \u2500\u2500 Listing sections \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
			{hasActiveFilters ? (
				/* \u2500\u2500 Filtered view: single flat grid \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
				<>
					<p className={styles.count} role="status" aria-live="polite">
						{countLabel}
					</p>
					{results.length === 0 ? (
						<div className={styles.emptyWrap}>
							<EmptyState
								title={
									query
										? `No listings match \u201c${query}\u201d`
										: "No matches with those filters"
								}
								message={
									query
										? "Try a different search term or clear your filters to see more opportunities."
										: "Try removing a filter to see more opportunities."
								}
							/>
							<Link className={styles.clearLink} href="/seek">
								Clear filters
							</Link>
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
									onHousingClick={(id) => setActiveBenefit({ id, bucket: "housing" })}
									onMealsClick={(id) => setActiveBenefit({ id, bucket: "meals" })}
									onPayClick={(id) => setActivePayId(id)}
									onLocationClick={(id) => router.push(`/map?focus=${id}`)}
									onReport={(id) => setReportId(id)}
								/>
							))}
						</div>
					)}
				</>
			) : results.length === 0 ? (
				<div className={styles.emptyWrap}>
					<EmptyState
						title="No opportunities yet"
						message="Check back soon — new roles are added regularly."
					/>
				</div>
			) : featuredResults.length > 0 && restResults.length > 0 ? (
				<>
					<ListingSection
						id="featured-listings-heading"
						title="Featured listings"
						listings={featuredResults}
						styles={styles}
						onOpen={setActiveId}
						onHostClick={setActiveHostId}
						onBenefit={setActiveBenefit}
						onPay={setActivePayId}
						onLocation={(id) => router.push(`/map?focus=${id}`)}
						onReport={setReportId}
					/>
					<ListingSection
						id="all-listings-heading"
						title="All listings"
						listings={restResults}
						styles={styles}
						onOpen={setActiveId}
						onHostClick={setActiveHostId}
						onBenefit={setActiveBenefit}
						onPay={setActivePayId}
						onLocation={(id) => router.push(`/map?focus=${id}`)}
						onReport={setReportId}
					/>
				</>
			) : (
				<ListingSection
					id="all-listings-heading"
					title={featuredResults.length === results.length ? "Featured listings" : "All listings"}
					listings={results}
					styles={styles}
					onOpen={setActiveId}
					onHostClick={setActiveHostId}
					onBenefit={setActiveBenefit}
					onPay={setActivePayId}
					onLocation={(id) => router.push(`/map?focus=${id}`)}
					onReport={setReportId}
				/>
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

			<BenefitTrustModal
				listing={activeBenefitListing}
				bucket={activeBenefit?.bucket ?? null}
				onClose={() => setActiveBenefit(null)}
			/>

			<PayDetailsDrawer
				listing={activePayListing}
				onClose={() => setActivePayId(null)}
			/>

			<ReportListingDrawer
				listing={activeReportListing}
				onClose={() => setReportId(null)}
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
				}}
				onApply={applyFilters}
			/>

			<SeekSortPopup
				open={sortOpen}
				onClose={() => setSortOpen(false)}
				category={category}
				onApply={applySort}
			/>
		</section>
	);
}
