import type { Metadata } from "next";
import {
	getHomepageBoostedListings,
	getHomepageFeaturedEmployers,
	getHomepageFallbackListings,
	HOMEPAGE_LISTING_SLOTS,
	HOMEPAGE_EMPLOYER_SLOTS,
	HOMEPAGE_MIN_BOOSTED_THRESHOLD,
	type HomepageFeaturedEmployer,
} from "@explore-and-earn/db";

import { MarketplaceHome } from "../components/home/MarketplaceHome";
import { buildDestinations, buildAnnouncements } from "../components/home/home-data";
import { DISCOVERY_FIXTURES, type DiscoveryListing } from "../components/discovery";
import {
	canUseDiscoveryFixtureFallback,
	hasDiscoveryPublicDataConfig,
} from "../components/discovery/data";
import { GlobalHeader } from "../components/global";
import { PublicBottomNav } from "../components/public/PublicBottomNav";
import type { FeaturedEmployer } from "../components/public/FeaturedEmployersRail";
import { buildFeaturedEmployers } from "../lib/employer-utils";
import { generateOrganizationJsonLd, generateWebSiteJsonLd } from "../lib/seo";
import styles from "./page.module.css";

export const metadata: Metadata = {
	title: {
		absolute: "Explore & Earn — Seasonal jobs with housing, meals & pay upfront",
	},
	description:
		"Discover seasonal work in places worth living — farms, coasts, resorts, and remote roles. Every opportunity answers the three questions that matter before you apply: where you'll sleep, what you'll eat, and what you'll earn.",
	alternates: { canonical: "/" },
	openGraph: {
		title: "Explore & Earn — Seasonal jobs with housing, meals & pay upfront",
		description:
			"A discovery marketplace for seasonal work and real-world exploration. Housing, meals, and pay — answered on every listing.",
		url: "/",
	},
};

export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://exploreandearn.com";

/** Map DB employer shape to the public-featured employer view model. */
function toRailEmployer(e: HomepageFeaturedEmployer): FeaturedEmployer {
	return {
		hostName:      e.hostName,
		hostId:        e.hostId,
		listingId:     e.listingId,
		location:      e.location,
		listingCount:  e.listingCount,
		verified:      e.verified,
		tagline:       e.tagline,
		coverImageUrl: e.coverImageUrl,
		category:      e.category,
		isBoosted:     true,
	};
}

export default async function HomePage() {
	const [boostedListings, featuredEmployerCampaigns] = await Promise.all([
		getHomepageBoostedListings(HOMEPAGE_LISTING_SLOTS),
		getHomepageFeaturedEmployers(HOMEPAGE_EMPLOYER_SLOTS),
	]);

	let featuredEmployers: readonly FeaturedEmployer[] =
		featuredEmployerCampaigns.map(toRailEmployer);

	const hasBoostedInventory = boostedListings.length >= HOMEPAGE_MIN_BOOSTED_THRESHOLD;
	let feedListings: readonly DiscoveryListing[];
	if (hasBoostedInventory) {
		feedListings = boostedListings.slice(0, HOMEPAGE_LISTING_SLOTS) as DiscoveryListing[];
	} else {
		feedListings = await getHomepageFallbackListings(HOMEPAGE_LISTING_SLOTS);
	}

	if (!hasDiscoveryPublicDataConfig() && canUseDiscoveryFixtureFallback()) {
		if (featuredEmployers.length === 0) {
			featuredEmployers = buildFeaturedEmployers(DISCOVERY_FIXTURES);
		}
		if (feedListings.length === 0) {
			feedListings = DISCOVERY_FIXTURES.slice(0, HOMEPAGE_LISTING_SLOTS);
		}
	}

	// Preview-only visual fullness: a configured-but-empty dev DB still renders a
	// populated homepage. Production never shows fixture inventory — an empty
	// marketplace falls through to the honest founding-season empty states.
	const isPreview = process.env.NODE_ENV !== "production";
	const landingListings =
		feedListings.length === 0 && isPreview
			? DISCOVERY_FIXTURES.slice(0, HOMEPAGE_LISTING_SLOTS)
			: feedListings;
	const landingEmployers =
		featuredEmployers.length === 0 && isPreview
			? buildFeaturedEmployers(DISCOVERY_FIXTURES)
			: featuredEmployers;

	// Destination + announcement view-models. Real, derived values win; curated
	// demo figures only fill in outside production (see home-data honesty rules).
	const destinations = buildDestinations(landingListings);
	const announcements = buildAnnouncements(landingEmployers);

	return (
		<>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: generateOrganizationJsonLd(SITE_URL) }}
			/>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: generateWebSiteJsonLd(SITE_URL) }}
			/>
			<GlobalHeader scope="guest" isAuthenticated={false} />
			<main className={styles.page}>
				<MarketplaceHome
					listings={landingListings}
					employers={landingEmployers}
					destinations={destinations}
					announcements={announcements}
				/>
			</main>
			<PublicBottomNav />
		</>
	);
}
