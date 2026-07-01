import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { Icon, cloudinaryPhoto } from "@explore-and-earn/ui";
import {
	getHomepageBoostedListings,
	getHomepageFeaturedEmployers,
	getHomepageFallbackListings,
	HOMEPAGE_LISTING_SLOTS,
	HOMEPAGE_EMPLOYER_SLOTS,
	HOMEPAGE_MIN_BOOSTED_THRESHOLD,
	type HomepageFeaturedEmployer,
} from "@explore-and-earn/db";
import { DISCOVERY_FIXTURES, type DiscoveryListing } from "../components/discovery";
import { DiscoveryFeed } from "../components/discovery";
import {
	canUseDiscoveryFixtureFallback,
	hasDiscoveryPublicDataConfig,
} from "../components/discovery/data";
import { buildFeaturedEmployers } from "../lib/employer-utils";
import { generateOrganizationJsonLd, generateWebSiteJsonLd } from "../lib/seo";
import { GlobalHeader } from "../components/global";
import { FeaturedEmployersRail } from "../components/public/FeaturedEmployersRail";
import { PublicBottomNav } from "../components/public/PublicBottomNav";
import type { FeaturedEmployer } from "../components/public/FeaturedEmployersRail";
import styles from "./page.module.css";

export const metadata: Metadata = {
	title: "Explore seasonal work, stays, and travel-ready roles",
	description:
		"Browse Explore & Earn opportunities across seek, swipe, and map modes to compare housing, meals, pay, and timing before you apply.",
};

export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://exploreandearn.com";

// Hero photo — swap slug/category once a dedicated hero bucket exists.
const HERO_IMAGE_URL = cloudinaryPhoto("maritime", "adam-gonzales-7rc7hb1acog", "hero");

// Community teaser uses a different photo for visual variety
const COMMUNITY_IMAGE_URL = cloudinaryPhoto("farm", "annie-spratt-jmjnnq2xfoy", "hero");

const DESTINATIONS = [
	{ label: "Alaska",     href: "/seek?location=Alaska" },
	{ label: "Hawaii",     href: "/seek?location=Hawaii" },
	{ label: "California", href: "/seek?location=California" },
	{ label: "Colorado",   href: "/seek?location=Colorado" },
	{ label: "Oregon",     href: "/seek?location=Oregon" },
	{ label: "Florida",    href: "/seek?location=Florida" },
] as const;

// ── Work category photo reel ──────────────────────────────────────────────────
const WORK_CATEGORIES = [
	{
		key:       "farm",
		label:     "Farm & Ranch",
		iconName:  "category.farm" as const,
		photoUrl:  cloudinaryPhoto("farm",     "annie-spratt-jmjnnq2xfoy",          "card"),
		href:      "/seek?category=farm",
	},
	{
		key:       "maritime",
		label:     "Maritime",
		iconName:  "category.maritime" as const,
		photoUrl:  cloudinaryPhoto("maritime", "adam-gonzales-7rc7hb1acog",          "card"),
		href:      "/seek?category=maritime",
	},
	{
		key:       "remote",
		label:     "Remote",
		iconName:  "category.remote" as const,
		photoUrl:  cloudinaryPhoto("remote",   "altumcode-iymqiblxk-8",             "card"),
		href:      "/seek?category=remote",
	},
	{
		key:       "seasonal",
		label:     "Seasonal",
		iconName:  "category.seasonal" as const,
		photoUrl:  cloudinaryPhoto("seasonal", "aleksandra-sapozhnikova-nbcribslxkq", "card"),
		href:      "/seek?category=seasonal",
	},
] as const;

// ── Founder-locked pricing — DO NOT CHANGE these values ──────────────────────
// Source of truth: Notion "Founder Locked Pricing — Canonical Host Plans"
// Seekers are free forever. Annual = 10 months ("2 months free").
const EMPLOYER_TIERS = [
	{
		tier:         "starter"      as const,
		name:         "Starter",
		monthlyPrice: "$199",
		annualPrice:  "$1,990",
		listings:     1,
		highlight:    false          as const,
	},
	{
		tier:         "professional" as const,
		name:         "Professional",
		monthlyPrice: "$399",
		annualPrice:  "$3,990",
		listings:     5,
		highlight:    true           as const,
	},
	{
		tier:         "enterprise"   as const,
		name:         "Enterprise",
		monthlyPrice: "$749",
		annualPrice:  "$7,490",
		listings:     10,
		highlight:    false          as const,
	},
] as const;


/** Map DB employer shape → FeaturedEmployersRail prop shape. */
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
	// ── Fetch boosted inventory + employer campaigns in parallel ──────────────
	const [boostedListings, featuredEmployerCampaigns] = await Promise.all([
		getHomepageBoostedListings(HOMEPAGE_LISTING_SLOTS),
		getHomepageFeaturedEmployers(HOMEPAGE_EMPLOYER_SLOTS),
	]);

	// ── Rail: featured employer campaigns only (no free-tier fallback on rail)
	let railEmployers: readonly FeaturedEmployer[] =
		featuredEmployerCampaigns.map(toRailEmployer);

	// ── Feed: boosted inventory or tier-ordered fallback (homepage only)
	// seek / swipe / map do NOT use this fallback — they rely on match weighting.
	const hasBoostedInventory = boostedListings.length >= HOMEPAGE_MIN_BOOSTED_THRESHOLD;
	let feedListings: readonly DiscoveryListing[];
	if (hasBoostedInventory) {
		feedListings = boostedListings.slice(0, HOMEPAGE_LISTING_SLOTS) as DiscoveryListing[];
	} else {
		feedListings = await getHomepageFallbackListings(HOMEPAGE_LISTING_SLOTS);
	}

	// ── Dev fixture fallback: only fires when Supabase is not configured ──────
	// In production, getHomepageFallbackListings returns real DB rows.
	if (!hasDiscoveryPublicDataConfig() && canUseDiscoveryFixtureFallback()) {
		if (railEmployers.length === 0) {
			railEmployers = buildFeaturedEmployers(DISCOVERY_FIXTURES);
		}
		if (feedListings.length === 0) {
			feedListings = DISCOVERY_FIXTURES.slice(0, HOMEPAGE_LISTING_SLOTS);
		}
	}

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

			{/* ── Hero: full-bleed photo + tagline + destinations ─────────── */}
			<section className={styles.hero}>
				<div className={styles.photoHero}>
					<Image
						src={HERO_IMAGE_URL}
						alt=""
						aria-hidden="true"
						fill
						className={styles.photoHeroBg}
						sizes="100vw"
						priority
					/>
					<div className={styles.photoHeroOverlay} aria-hidden="true" />

					<div className={styles.photoHeroContent}>
						<div className={styles.photoHeroCopy}>
							<p className={styles.photoHeroEyebrow}>
								<span className={styles.photoHeroEyebrowDot} aria-hidden="true" />
								Welcome to Explore &amp; Earn
							</p>
							<h1 className={styles.photoHeroTitle}>
								Built by seekers,<br />for seekers.
							</h1>
							<p className={styles.photoHeroSummary}>
								Seasonal work, stays, and travel-ready roles — with housing, meals,
								and pay visible before you commit.
							</p>
						</div>

						<div className={styles.photoHeroActions}>
							<Link className={styles.photoHeroPrimary} href="/seek">
								Start exploring
								<Icon name="action.forward" size={16} aria-hidden />
							</Link>
							<Link className={styles.photoHeroSecondary} href="/map">
								View map
							</Link>
						</div>
					</div>

					<div className={styles.destinations}>
						<p className={styles.destinationsLabel}>Popular destinations</p>
						<div className={styles.destinationPills}>
							{DESTINATIONS.map((dest) => (
								<Link key={dest.label} href={dest.href} className={styles.destinationPill}>
									{dest.label}
								</Link>
							))}
						</div>
					</div>
				</div>
			</section>

			{/* ── Category grid (4-up desktop) → scroll-snap row on mobile ── */}
			<section className={styles.categoryReel} aria-label="Browse by category">
				<div className={styles.categoryReelTrack}>
					{WORK_CATEGORIES.map((cat) => (
						<Link key={cat.key} href={cat.href} className={styles.reelCard}>
							<Image src={cat.photoUrl} alt="" aria-hidden="true" fill className={styles.reelPhoto} sizes="(min-width: 900px) 22vw, 70vw" />
							<div className={styles.reelOverlay} aria-hidden="true" />
							<div className={styles.reelMeta}>
								<Icon name={cat.iconName} size={16} aria-hidden />
								<span className={styles.reelLabel}>{cat.label}</span>
							</div>
						</Link>
					))}
				</div>
			</section>

			{/* ── Employers + Community — 2-col on desktop ─────────────── */}
			<div className={styles.splitPair}>

				<section className={styles.employerCard} aria-label="Platform overview">
					<p className={styles.employerEyebrow}>For Employers</p>
					<h2 className={styles.employerTitle}>List. Boost.<br />Get found.</h2>

					<ul className={styles.tierTable} role="list">
						{EMPLOYER_TIERS.map((t) => (
							<li
								key={t.tier}
								className={t.highlight
									? `${styles.tierRow} ${styles.tierHighlight}`
									: styles.tierRow}
							>
								<span className={styles.tierName}>{t.name}</span>
								<span className={styles.tierListings}>
									{t.listings}{t.listings === 1 ? " listing" : " listings"}
								</span>
								<span className={styles.tierPrice}>
									{t.monthlyPrice}
									<span className={styles.tierPer}>/mo</span>
								</span>
							</li>
						))}
					</ul>

					<p className={styles.annualNote}>
						Annual plans available — 2 months free.
					</p>

					<Link href="/for-hosts" className={styles.employerCta}>
						See your dashboard
						<Icon name="action.forward" size={16} aria-hidden />
					</Link>
				</section>

				<section className={styles.communityTeaser} aria-label="Community">
					<Image
						src={COMMUNITY_IMAGE_URL}
						alt=""
						aria-hidden="true"
						fill
						className={styles.teaserBg}
						sizes="(min-width: 960px) 50vw, 100vw"
					/>
					<div className={styles.teaserOverlay} aria-hidden="true" />
					<div className={styles.teaserContent}>
						<p className={styles.teaserEyebrow}>Community</p>
						<h2 className={styles.teaserTitle}>Your adventure,<br />tracked.</h2>
						<p className={styles.teaserDesc}>
							Log every opportunity. Compare what you&rsquo;ve seen. Connect with
							seekers who&rsquo;ve been there — and employers who are ready for you.
						</p>
						<Link href="/sign-up?next=/community" className={styles.teaserCta}>
							Join the community
							<Icon name="action.forward" size={16} aria-hidden />
						</Link>
					</div>
				</section>

			</div>

			{/* ── Featured employers rail ────────────────────────────────── */}
			{railEmployers.length > 0 ? (
				<FeaturedEmployersRail employers={railEmployers} />
			) : null}

			{/* ── Featured listings feed ─────────────────────────────────── */}
			{feedListings.length > 0 ? (
				<DiscoveryFeed
					listings={feedListings}
					loading={false}
					heading="Featured opportunities"
					subheading="Live roles from verified employers — housing, meals, and pay upfront, before you apply."
				/>
			) : null}

			<PublicBottomNav />
		</main>
		</>
	);
}
