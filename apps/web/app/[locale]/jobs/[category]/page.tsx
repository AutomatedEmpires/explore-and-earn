import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { rowToDiscoveryFields } from "@explore-and-earn/db";
import { Icon } from "@explore-and-earn/ui";

import {
	DISCOVERY_FIXTURES,
	type DiscoveryListing,
} from "../../../../components/discovery";
import {
	canUseDiscoveryFixtureFallback,
	hasDiscoveryPublicDataConfig,
} from "../../../../components/discovery/data";
import { CategoryListingsIsland } from "../../../../components/jobs/CategoryListingsIsland";
import {
	CATEGORY_LANDING,
	LANDING_CATEGORIES,
	buildCategoryLandingMetadata,
	categoryLandingPath,
	isLandingCategory,
	type LandingCategory,
} from "../../../../lib/categoryLanding";
import { byMonetization, type MonetizationInputs } from "../../../../lib/ranking";
import {
	generateBreadcrumbJsonLd,
	generateCollectionPageJsonLd,
} from "../../../../lib/seo";
import { getCategoryListingsCached } from "../../../../lib/serverCache";
import styles from "../jobs.module.css";

/**
 * ISR, not force-dynamic (review 2026-07-23): the page reads no request data,
 * so it prerenders per lane and re-renders every 60s — matching the data
 * cache's revalidate window. Crucially, `dynamicParams = false` makes any
 * non-lane slug (/jobs/mix, /jobs/anything) a ROUTER-level hard 404: with the
 * [locale] loading boundary, a notFound() thrown during a dynamic render
 * streams AFTER the 200 status is committed — a soft 404 crawlers would index.
 */
export const revalidate = 60;
export const dynamicParams = false;

export function generateStaticParams(): Array<{ category: string }> {
	return LANDING_CATEGORIES.map((category) => ({ category }));
}

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://exploreandearn.com";
const CATEGORY_PAGE_LIMIT = 48;

interface CategoryPageProps {
	readonly params: Promise<{ category: string }>;
}

export async function generateMetadata({
	params,
}: CategoryPageProps): Promise<Metadata> {
	const { category } = await params;
	if (!isLandingCategory(category)) notFound();
	return buildCategoryLandingMetadata(category);
}

/** Same accessor shape the map uses — boosted > tier; anon has no matchScore. */
function toRankInputs(listing: DiscoveryListing): MonetizationInputs {
	return {
		boosted: listing.conditionalBadges?.includes("boosted"),
		hostTier: listing.host?.tier,
		matchScore: listing.matchScore,
	};
}

/**
 * The hero's written state line — composed from the rows this page actually
 * renders (48-capped with a "+"), never a fabricated marketplace total. Zero
 * inventory states the publish-gate truth instead of apologizing.
 */
function laneLede(count: number, capped: boolean, readFailed: boolean): {
	countText: string | null;
	rest: string;
} {
	if (readFailed) {
		// A faulted read is never dressed up as an empty lane.
		return {
			countText: null,
			rest: "This lane couldn't be read just now — refresh in a moment to try again.",
		};
	}
	if (count === 0) {
		return {
			countText: null,
			rest: "No roles are live in this lane yet — we only publish opportunities that answer housing, meals, and pay up front.",
		};
	}
	const noun = count === 1 ? "role is" : "roles are";
	return {
		countText: `${count}${capped ? "+" : ""}`,
		rest: ` ${noun} live right now — every card states housing, meals, and pay before you apply.`,
	};
}

/**
 * /jobs/{farm|maritime|remote|seasonal} — the indexable category landing page.
 *
 * Data honesty (same three-branch gate as /search):
 *  1. Real DB (cached 60s via lib/serverCache) — live listings only, ordered by
 *     the founder's monetization ranking (byMonetization: orders, never hides).
 *  2. Dev/preview fixture fallback — never in production.
 *  3. Production without public data config — honest empty state, no fixtures.
 * The live count shown is the count of listings ACTUALLY rendered (48-capped
 * with a "+"), never a fabricated marketplace total.
 */
export default async function CategoryLandingPage({ params }: CategoryPageProps) {
	const { category } = await params;
	if (!isLandingCategory(category)) notFound();
	const copy = CATEGORY_LANDING[category];

	let listings: readonly DiscoveryListing[];
	let readFailed = false;
	if (hasDiscoveryPublicDataConfig()) {
		try {
			const rows = await getCategoryListingsCached(category, CATEGORY_PAGE_LIMIT);
			listings = rows
				.map((row) => rowToDiscoveryFields(row, undefined))
				.sort(byMonetization(toRankInputs));
		} catch {
			// A faulted read degrades this page's listing section only — it is
			// never rendered as "no roles listed yet" (a lie during an outage)
			// and never crashes the indexable page into the error boundary.
			readFailed = true;
			listings = [];
		}
	} else if (canUseDiscoveryFixtureFallback()) {
		listings = DISCOVERY_FIXTURES.filter((l) => l.category === category);
	} else {
		listings = [];
	}

	const path = categoryLandingPath(category);
	const breadcrumbJsonLd = generateBreadcrumbJsonLd([
		{ name: "Explore & Earn", url: SITE_URL },
		{ name: "Jobs", url: `${SITE_URL}/jobs` },
		{ name: copy.label, url: `${SITE_URL}${path}` },
	]);
	// On a faulted read we assert nothing about the collection — an empty
	// ItemList would claim "zero items" with no read to back it.
	const collectionJsonLd = readFailed
		? null
		: generateCollectionPageJsonLd({
				name: copy.title,
				description: copy.description,
				url: `${SITE_URL}${path}`,
				items: listings.map((listing) => ({
					name: listing.title,
					url: `${SITE_URL}/listing/${listing.id}`,
				})),
			});

	const otherLanes = LANDING_CATEGORIES.filter((lane) => lane !== category);
	const lede = laneLede(
		listings.length,
		listings.length >= CATEGORY_PAGE_LIMIT,
		readFailed,
	);

	return (
		<>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: breadcrumbJsonLd }}
			/>
			{collectionJsonLd ? (
				<script
					type="application/ld+json"
					dangerouslySetInnerHTML={{ __html: collectionJsonLd }}
				/>
			) : null}
			<div className={styles.page}>
				{/* The hero band paints the lane's OWN cover gradient (keyed by
				    data-category in jobs.module.css). There is no lane photograph -- see
				    lib/categoryLanding.ts. */}
				<header className={styles.hero} data-category={category}>
					<span className={styles.heroScrim} aria-hidden />
					<div className={styles.heroBody}>
						<p className={styles.heroEyebrow}>
							<Icon name={`category.${category}`} size={16} aria-hidden />
							{copy.blurb}
						</p>
						<h1 className={styles.heroTitle}>
							{copy.heading}
							<span className={styles.titleMark}>.</span>
						</h1>
						<p className={styles.heroLede}>
							{lede.countText ? <b>{lede.countText}</b> : null}
							{lede.rest}
						</p>
						<div className={styles.heroActions}>
							<Link
								className={styles.heroCta}
								href={`/seek?category=${category}`}
							>
								Filter &amp; sort in Seek
								<Icon name="action.forward" size={16} aria-hidden />
							</Link>
							<Link
								className={styles.heroCtaQuiet}
								href={`/search?category=${category}`}
							>
								Search this lane
							</Link>
						</div>
					</div>
				</header>

				<CategoryListingsIsland
					category={category}
					listings={listings}
					readFailed={readFailed}
				/>

				<nav className={styles.laneNav} aria-label="Other categories">
					<p className={styles.laneNavLabel}>Scout a different lane</p>
					<ul className={styles.laneNavList} role="list">
						{otherLanes.map((lane: LandingCategory) => (
							<li key={lane}>
								<Link
									className={styles.laneNavChip}
									href={categoryLandingPath(lane)}
								>
									<Icon name={`category.${lane}`} size={16} aria-hidden />
									{CATEGORY_LANDING[lane].label}
								</Link>
							</li>
						))}
						<li>
							<Link className={styles.laneNavChip} href="/seek">
								<Icon name="nav.seek" size={16} aria-hidden />
								All work
							</Link>
						</li>
					</ul>
				</nav>
			</div>
		</>
	);
}
