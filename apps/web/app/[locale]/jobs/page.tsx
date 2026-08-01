import type { Metadata } from "next";
import Link from "next/link";

import { Icon } from "@explore-and-earn/ui";

import {
	CATEGORY_LANDING,
	LANDING_CATEGORIES,
	categoryLandingPath,
} from "../../../lib/categoryLanding";
import {
	generateBreadcrumbJsonLd,
	generateCollectionPageJsonLd,
} from "../../../lib/seo";
import styles from "./jobs.module.css";

// Static content (founder lane copy only — no request data, no counts); a
// long revalidate keeps it aligned with deploys without per-request work.
export const revalidate = 3600;

export const metadata: Metadata = {
	// The root template appends "| Explore & Earn" — don't bake it in twice.
	// No openGraph key on purpose: the root brand card flows through untouched.
	title: "Browse seasonal jobs by category",
	description:
		"Farm, maritime, remote, and seasonal work — every listing answers the three questions that matter before you apply: where you'll sleep, what you'll eat, and what you'll earn.",
	alternates: { canonical: "/jobs" },
	robots: { index: true, follow: true },
};

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://exploreandearn.com";

/**
 * /jobs — the storefront. The homepage's primary CTA lands here, so the page
 * carries the marketplace's shape: the Basecamp header states the triad
 * contract, a plain GET form hands a query to /search (no JS required), the
 * four founder-locked lanes carry their approved copy, and two quiet bands
 * route browsing (Seek / Swipe / Map) and hosting (/for-hosts). No counts
 * anywhere — this page is static; the lane landings show real live state.
 */
export default function JobsHubPage() {
	const breadcrumbJsonLd = generateBreadcrumbJsonLd([
		{ name: "Explore & Earn", url: SITE_URL },
		{ name: "Jobs", url: `${SITE_URL}/jobs` },
	]);
	// The hub's collection is the four lane landing pages themselves — real,
	// enumerable destinations (never listing counts; the hub fetches none).
	const lanesJsonLd = generateCollectionPageJsonLd({
		name: "Browse seasonal jobs by category",
		description:
			"The four Explore & Earn lanes: farm, maritime, remote, and seasonal work.",
		url: `${SITE_URL}/jobs`,
		items: LANDING_CATEGORIES.map((category) => ({
			name: CATEGORY_LANDING[category].title,
			url: `${SITE_URL}${categoryLandingPath(category)}`,
		})),
	});

	return (
		<>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: breadcrumbJsonLd }}
			/>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: lanesJsonLd }}
			/>
			<div className={styles.page}>
				<header className={styles.hubHeader}>
					<p className={styles.hubEyebrow}>The marketplace</p>
					<h1 className={styles.hubTitle}>
						Four lanes of work<span className={styles.titleMark}>.</span>
					</h1>
					<p className={styles.hubLede}>
						Farm, maritime, remote, and seasonal — every listing answers where
						you&rsquo;ll sleep, what you&rsquo;ll eat, and what you&rsquo;ll
						earn before you apply.
					</p>
				</header>

				{/* Plain GET form: the hub's "ask" affordance. Submits to /search as a
				    full navigation, so it works before any JS loads. */}
				<form
					className={styles.searchBand}
					action="/search"
					method="get"
					role="search"
					aria-label="Search the marketplace"
				>
					<input
						className={styles.searchInput}
						type="search"
						name="q"
						inputMode="search"
						placeholder="Search by role, host, or place"
						aria-label="Search by role, host, or place"
					/>
					<button className={styles.searchSubmit} type="submit">
						<Icon name="nav.seek" size={18} aria-hidden />
						Search
					</button>
					<p className={styles.searchAside}>
						Need lane, benefit, pay, or date filters? Open the{" "}
						<Link href="/search">full search</Link>.
					</p>
				</form>

				<ul className={styles.laneGrid} role="list">
					{LANDING_CATEGORIES.map((category) => {
						const copy = CATEGORY_LANDING[category];
						return (
							<li key={category} className={styles.laneItem}>
								<Link
									className={styles.laneCard}
									data-category={category}
									href={categoryLandingPath(category)}
								>
									<span className={styles.laneScrim} aria-hidden />
									<span className={styles.laneBody}>
										<span className={styles.laneLabel}>
											<Icon name={`category.${category}`} size={18} aria-hidden />
											{copy.label}
										</span>
										<span className={styles.laneBlurb}>{copy.blurb}</span>
									</span>
									<Icon name="action.forward" size={18} aria-hidden />
								</Link>
							</li>
						);
					})}
				</ul>

				<div className={styles.bandGrid}>
					<section className={styles.band} aria-labelledby="jobs-browse-title">
						<h2 className={styles.bandTitle} id="jobs-browse-title">
							Prefer to browse?
						</h2>
						<p className={styles.bandText}>
							Seek shows the whole grid, Swipe deals one role at a time, and
							the map knows every place.
						</p>
						<ul className={styles.bandLinks} role="list">
							<li>
								<Link className={styles.bandLink} href="/seek">
									<Icon name="nav.seek" size={16} aria-hidden />
									Seek
								</Link>
							</li>
							<li>
								<Link className={styles.bandLink} href="/swipe">
									<Icon name="nav.swipe" size={16} aria-hidden />
									Swipe
								</Link>
							</li>
							<li>
								<Link className={styles.bandLink} href="/map">
									<Icon name="nav.map" size={16} aria-hidden />
									Map
								</Link>
							</li>
						</ul>
					</section>
					<section className={styles.band} aria-labelledby="jobs-host-title">
						<h2 className={styles.bandTitle} id="jobs-host-title">
							Have a season to staff?
						</h2>
						<p className={styles.bandText}>
							Publish a listing that answers housing, meals, and pay up front —
							that answer is the condition of being listed here.
						</p>
						<ul className={styles.bandLinks} role="list">
							<li>
								<Link className={styles.bandLink} href="/for-hosts">
									<Icon name="action.forward" size={16} aria-hidden />
									Explore hosting
								</Link>
							</li>
						</ul>
					</section>
				</div>
			</div>
		</>
	);
}
