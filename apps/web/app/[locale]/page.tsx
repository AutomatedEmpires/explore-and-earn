import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
	HOMEPAGE_LISTING_SLOTS,
	HOMEPAGE_EMPLOYER_SLOTS,
	type HomepageFeaturedEmployer,
} from "@explore-and-earn/db";

import { HOME_HERO_ROTATION } from "../../components/home/home-data";

import { MarketplaceHome } from "../../components/home/MarketplaceHome";
import { buildDestinations, buildAnnouncements } from "../../components/home/home-data";
import { DISCOVERY_FIXTURES } from "../../components/discovery";
import {
	getLandingEmployers,
	getLandingListings,
} from "../../lib/landingInventory";
import { PublicShell } from "../../components/public/PublicShell";
import type { FeaturedEmployer } from "../../components/public/FeaturedEmployersRail";
import { buildFeaturedEmployers } from "../../lib/employer-utils";
import { generateOrganizationJsonLd, generateWebSiteJsonLd } from "../../lib/seo";
import styles from "./page.module.css";

// Server-side i18n proof: the homepage's SEO metadata is now sourced from the
// message catalog via getTranslations (the getTranslations half of the pipeline,
// complementing the useTranslations client usages in the header/hero/apply gate).
// hreflang scaffold (en only) rides on this key page per the i18n plan.
export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Meta");
	return {
		title: { absolute: t("homeTitle") },
		description: t("homeDescription"),
		alternates: {
			canonical: "/",
			languages: { en: "/", "x-default": "/" },
		},
		openGraph: {
			title: t("homeTitle"),
			description: t("homeOgDescription"),
			url: "/",
		},
	};
}

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
	// Cached anon reads (60s, tag-busted on publish/edit — lib/serverCache.ts):
	// the homepage was the one hot public surface still running its full query
	// chain per request (review 2026-07-22). The listing resolution — boosted,
	// then fallback, then the non-production example fixtures — moved to
	// lib/landingInventory so /for-seekers cannot drift from it.
	const [inventory, featuredEmployerCampaigns] = await Promise.all([
		getLandingListings(HOMEPAGE_LISTING_SLOTS),
		getLandingEmployers(HOMEPAGE_EMPLOYER_SLOTS),
	]);

	let featuredEmployers: readonly FeaturedEmployer[] =
		featuredEmployerCampaigns.map(toRailEmployer);
	const feedListings = inventory.listings;

	// Hero rotation is picked SERVER-side (the page stays force-dynamic): the
	// band that renders on the server is the one that stays on screen. The old
	// post-mount random pick swapped the hero after hydration on 4/5 of visits
	// (review 2026-07-22). The pick is a deterministic 3-minute time window —
	// the founder's spec ("rotates per landing or every 3–5 min") verbatim, no
	// randomness (CodeQL js/insecure-randomness stays quiet), and consecutive
	// requests within a window agree, which plays well with any edge caching.
	const HERO_ROTATION_WINDOW_MS = 3 * 60 * 1000;
	const heroIndex =
		HOME_HERO_ROTATION.length > 1
			? Math.floor(Date.now() / HERO_ROTATION_WINDOW_MS) % HOME_HERO_ROTATION.length
			: 0;

	// Preview-only visual fullness for the RAILS: a configured-but-empty dev DB
	// still renders a populated homepage. Production never shows fixture
	// employers — an empty marketplace falls through to the honest empty states.
	// (The listing half of this now lives in lib/landingInventory, which applies
	// the same NODE_ENV gate.)
	if (featuredEmployers.length === 0 && process.env.NODE_ENV !== "production") {
		featuredEmployers = buildFeaturedEmployers(DISCOVERY_FIXTURES);
	}
	const landingListings = feedListings;
	const landingEmployers = featuredEmployers;

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
			<PublicShell>
				<div className={styles.page}>
					<MarketplaceHome
						listings={landingListings}
						employers={landingEmployers}
						destinations={destinations}
						announcements={announcements}
						heroIndex={heroIndex}
					/>
				</div>
			</PublicShell>
		</>
	);
}
