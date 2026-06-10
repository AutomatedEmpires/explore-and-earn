import Link from "next/link";
import type { Metadata } from "next";
import { Icon } from "@explore-and-earn/ui";

import { DiscoveryFeed, DiscoveryCardSkeleton } from "../components/discovery";
import { getDiscoveryListings } from "../components/discovery/data";
import { GlobalHeader } from "../components/global";
import { FeaturedEmployersRail } from "../components/public/FeaturedEmployersRail";
import { PublicBottomNav } from "../components/public/PublicBottomNav";
import { buildFeaturedEmployers } from "../lib/employer-utils";
import styles from "./page.module.css";

export const metadata: Metadata = {
	title: "Explore seasonal work, stays, and travel-ready roles",
	description:
		"Browse Explore & Earn opportunities across seek, swipe, and map modes to compare housing, meals, pay, and timing before you apply.",
};

export const dynamic = "force-dynamic";

export default async function HomePage() {
	const listings = await getDiscoveryListings();
	const leadListing =
		listings.find((listing) => listing.conditionalBadges?.includes("boosted")) ??
		listings[0] ??
		null;
	const featuredEmployers = buildFeaturedEmployers(listings);
	const featuredListings = listings.filter(
		(listing) =>
			listing.conditionalBadges?.includes("boosted") ||
			listing.conditionalBadges?.includes("seasonal") ||
			listing.host.verified,
	);
	const homepageListings =
		featuredListings.length >= 3 ? featuredListings.slice(0, 6) : listings.slice(0, 6);

	return (
		<>
		<GlobalHeader scope="guest" isAuthenticated={false} />
		<main className={styles.page}>

			{/* ── Hero: copy panel + featured listing card ───────────────── */}
			<section className={styles.hero}>
				<div className={styles.heroPanel}>
					<div className={styles.heroCopy}>
						<p className={styles.eyebrow}>Explore &amp; Earn</p>
						<h1 className={styles.title}>
							Seasonal work, employer stays, and travel-ready roles in one clear pass.
						</h1>
						<p className={styles.summary}>
							Start with a stronger first impression: featured employers up front, featured listings below, and housing, meals, pay, and dates visible before you commit.
						</p>
					</div>

					<div className={styles.heroActions}>
						<Link className={styles.primaryAction} href="/seek">
							Start exploring
							<Icon name="action.forward" size={16} aria-hidden />
						</Link>
						<Link className={styles.secondaryAction} href="/swipe">
							Try swipe
						</Link>
					</div>

					<div className={styles.heroMeta}>
						<div className={styles.metaCard}>
							<span className={styles.metaLabel}>Browse modes</span>
							<p className={styles.metaValue}>Seek, map, and swipe</p>
						</div>
						<div className={styles.metaCard}>
							<span className={styles.metaLabel}>What shows first</span>
							<p className={styles.metaValue}>Housing, meals, pay, and dates</p>
						</div>
					</div>
				</div>

				{leadListing ? (
					<article className={styles.heroFeature}>
						<div className={styles.heroFeatureTop}>
							<span className={styles.heroBadge}>Featured listing</span>
							{leadListing.conditionalBadges?.includes("seasonal") ? (
								<span className={styles.heroBadgeAccent}>Seasonal</span>
							) : null}
						</div>
						<div className={styles.heroFeatureBody}>
							<p className={styles.heroFeatureHost}>{leadListing.host.name}</p>
							<h2 className={styles.heroFeatureTitle}>{leadListing.title}</h2>
							<p className={styles.heroFeatureSummary}>{leadListing.location}</p>
						</div>
						<div className={styles.heroFeatureMeta}>
							<div className={styles.heroFeatureMetaCard}>
								<span className={styles.metaLabel}>Housing</span>
								<p className={styles.metaValue}>{leadListing.benefits.housing.summary ?? "Included"}</p>
							</div>
							<div className={styles.heroFeatureMetaCard}>
								<span className={styles.metaLabel}>Meals</span>
								<p className={styles.metaValue}>{leadListing.benefits.meals.summary ?? "Included"}</p>
							</div>
							<div className={styles.heroFeatureMetaCard}>
								<span className={styles.metaLabel}>Pay</span>
								<p className={styles.metaValue}>{leadListing.benefits.pay.summary ?? "Open pay details"}</p>
							</div>
						</div>
						<div className={styles.heroFeatureActions}>
							<Link className={styles.primaryAction} href={`/listing/${leadListing.id}`}>
								Open listing
								<Icon name="action.forward" size={16} aria-hidden />
							</Link>
							<Link className={styles.secondaryAction} href="/map">
								View on map
							</Link>
						</div>
					</article>
				) : (
					<div className={styles.heroFeatureSkeleton} aria-hidden="true">
						<DiscoveryCardSkeleton />
					</div>
				)}
			</section>

			{/* ── Featured employers rail ────────────────────────────────── */}
			<FeaturedEmployersRail employers={featuredEmployers} />

			{/* ── Featured listings feed ─────────────────────────────────── */}
			<DiscoveryFeed
				listings={homepageListings}
				loading={homepageListings.length === 0}
				heading="Featured listings"
				subheading="A tighter first pass through the strongest live roles, with benefits and timing visible before you open the full listing."
			/>

			<PublicBottomNav />
		</main>
		</>
	);
}
