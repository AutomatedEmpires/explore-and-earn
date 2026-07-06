"use client";

import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import type { OpportunityCategory } from "@explore-and-earn/contracts";
import { Icon, type IconKey } from "@explore-and-earn/ui";

import type { DiscoveryListing } from "../discovery";
import type { FeaturedEmployer } from "../public/FeaturedEmployersRail";
import {
	FlowCardRail,
	FloatingMapPins,
	LiquidGlassPanel,
	MagneticCard,
	MotionSection,
	RevealText,
	RippleField,
	ScrollScene,
	type FloatingMapPin,
} from "../motion";
import styles from "./CinematicLanding.module.css";

interface CinematicLandingProps {
	readonly listings: readonly DiscoveryListing[];
	readonly employers: readonly FeaturedEmployer[];
}

const CATEGORY_LABELS: Record<OpportunityCategory, string> = {
	farm: "Farm",
	maritime: "Maritime",
	remote: "Remote",
	seasonal: "Seasonal",
	mix: "Mix",
};

const CATEGORY_ICONS: Record<OpportunityCategory, IconKey> = {
	farm: "category.farm",
	maritime: "category.maritime",
	remote: "category.remote",
	seasonal: "category.seasonal",
	mix: "category.mix",
};

const FALLBACK_PINS: readonly FloatingMapPin[] = [
	{ label: "Wenatchee", category: "farm", x: 20, y: 38, value: "harvest" },
	{ label: "Sitka", category: "maritime", x: 34, y: 22, value: "deckhand" },
	{ label: "Remote", category: "remote", x: 58, y: 42, value: "ops" },
	{ label: "Breckenridge", category: "seasonal", x: 70, y: 62, value: "winter" },
	{ label: "Lisbon", category: "mix", x: 84, y: 34, value: "hostel" },
];

const FLOW_STEPS = [
	{ label: "Seeker", icon: "nav.profile" },
	{ label: "Place", icon: "nav.map" },
	{ label: "Job", icon: "status.open" },
	{ label: "Host", icon: "nav.hosts" },
	{ label: "Match", icon: "status.match" },
	{ label: "Move", icon: "action.forward" },
	{ label: "Opportunity", icon: "trust.featured_employer" },
] as const satisfies ReadonlyArray<{ label: string; icon: IconKey }>;

const FILTER_DIMENSIONS = [
	{ label: "Category", value: "Farm / maritime / remote / seasonal", icon: "action.filter" },
	{ label: "Fit", value: "Skills, readiness, saved jobs", icon: "status.match" },
	{ label: "Housing", value: "Room, berth, cabin, dorm", icon: "benefit.housing" },
	{ label: "Wage", value: "Hourly, daily, stipend, share", icon: "benefit.pay" },
	{ label: "Location", value: "Map-first discovery", icon: "nav.map" },
	{ label: "Date", value: "Windows that line up", icon: "status.begins" },
] as const satisfies ReadonlyArray<{ label: string; value: string; icon: IconKey }>;

const SEEKER_SIGNALS = [
	{ label: "Skills", value: "Deckhand / harvest / hospitality", icon: "profile.skills" },
	{ label: "Preferences", value: "Housing included, meals partial, mountain ready", icon: "action.settings" },
	{ label: "Readiness", value: "Available Aug-Oct", icon: "system.success" },
	{ label: "Saved", value: "12 watched roles", icon: "nav.saved" },
] as const satisfies ReadonlyArray<{ label: string; value: string; icon: IconKey }>;

const HOST_SYSTEM = [
	{ label: "Listings", value: "5 live", icon: "status.open" },
	{ label: "Applicants", value: "38 in review", icon: "analytics.funnel" },
	{ label: "Verification", value: "Housing evidence locked", icon: "trust.verified_host" },
	{ label: "Boosted placement", value: "Premium lane active", icon: "status.boosted" },
	{ label: "Hiring flow", value: "Offer -> travel -> arrival", icon: "action.forward" },
] as const satisfies ReadonlyArray<{ label: string; value: string; icon: IconKey }>;

const TRUST_SIGNALS = [
	{ label: "HOUSING", value: "Where will I sleep?", icon: "benefit.housing" },
	{ label: "MEALS", value: "What will I eat?", icon: "benefit.meals" },
	{ label: "PAY", value: "What will I earn?", icon: "benefit.pay" },
	{ label: "Host quality", value: "Verified-host qualifier visible", icon: "trust.verified_host" },
	{ label: "Safety", value: "Evidence before commitment", icon: "system.lock" },
] as const satisfies ReadonlyArray<{ label: string; value: string; icon: IconKey }>;

function benefitSummary(listing: DiscoveryListing, kind: "housing" | "meals" | "pay") {
	return listing.benefits[kind].summary ?? (
		listing.benefits[kind].provision === "provided"
			? "Provided"
			: listing.benefits[kind].provision === "partial"
				? "Partial"
				: "Not included"
	);
}

function listingImage(listing: DiscoveryListing | undefined) {
	return listing?.coverImageUrl ?? null;
}

function buildPins(listings: readonly DiscoveryListing[]): readonly FloatingMapPin[] {
	const positioned = listings
		.filter((listing) => listing.coordinates)
		.slice(0, 5)
		.map((listing, index) => ({
			label: listing.location.split(",")[0] ?? listing.location,
			category: listing.category,
			x: [18, 34, 53, 69, 82][index] ?? 50,
			y: [40, 24, 52, 34, 64][index] ?? 50,
			value: CATEGORY_LABELS[listing.category],
		}));

	return positioned.length >= 3 ? positioned : FALLBACK_PINS;
}

function MiniOpportunityCard({
	listing,
	compact = false,
}: {
	readonly listing: DiscoveryListing;
	readonly compact?: boolean;
}) {
	const imageUrl = listingImage(listing);

	return (
		<MagneticCard className={compact ? styles.miniCardCompact : styles.miniCard} strength={compact ? 5 : 8}>
			<Link className={styles.miniCardLink} href={`/listing/${listing.id}`}>
				<div className={styles.miniCardImageWrap}>
					{imageUrl ? (
						<Image
							src={imageUrl}
							alt=""
							aria-hidden="true"
							fill
							className={styles.miniCardImage}
							sizes={compact ? "180px" : "(min-width: 960px) 280px, 72vw"}
						/>
					) : null}
					<span className={`${styles.categoryChip} ${styles[`category_${listing.category}`]}`}>
						<Icon name={CATEGORY_ICONS[listing.category]} size={16} aria-hidden />
						{CATEGORY_LABELS[listing.category]}
					</span>
				</div>
				<div className={styles.miniCardBody}>
					<div className={styles.cardTopline}>
						<span>{listing.location}</span>
						{listing.matchScore ? <strong>{listing.matchScore}% fit</strong> : null}
					</div>
					<h3>{listing.title}</h3>
					<p>{listing.host.name}</p>
					<div className={styles.triadGrid} aria-label="Housing, meals, and pay">
						<span><Icon name="benefit.housing" size={16} aria-hidden />{benefitSummary(listing, "housing")}</span>
						<span><Icon name="benefit.meals" size={16} aria-hidden />{benefitSummary(listing, "meals")}</span>
						<span><Icon name="benefit.pay" size={16} aria-hidden />{benefitSummary(listing, "pay")}</span>
					</div>
				</div>
			</Link>
		</MagneticCard>
	);
}

function DimensionCard({
	label,
	value,
	icon,
	index,
}: {
	readonly label: string;
	readonly value: string;
	readonly icon: IconKey;
	readonly index: number;
}) {
	return (
		<LiquidGlassPanel
			tone={index % 2 === 0 ? "frost" : "clear"}
			className={styles.dimensionCard}
			delay={index * 0.035}
		>
			<Icon name={icon} size={20} aria-hidden />
			<span>{label}</span>
			<strong>{value}</strong>
		</LiquidGlassPanel>
	);
}

function SignalNode({
	label,
	value,
	icon,
}: {
	readonly label: string;
	readonly value: string;
	readonly icon: IconKey;
}) {
	return (
		<div className={styles.signalNode}>
			<span className={styles.signalIcon}><Icon name={icon} size={20} aria-hidden /></span>
			<span>
				<strong>{label}</strong>
				<small>{value}</small>
			</span>
		</div>
	);
}

export function CinematicLanding({ listings, employers }: CinematicLandingProps) {
	const featuredListings = listings.length > 0 ? listings.slice(0, 6) : [];
	const primaryListing = featuredListings[0];
	const secondaryListing = featuredListings[1] ?? primaryListing;
	const mapPins = buildPins(featuredListings);
	const heroImage = listingImage(secondaryListing ?? primaryListing);
	const hostLead = employers[0];

	return (
		<div className={styles.experience}>
			<section className={styles.hero} aria-labelledby="home-hero-title">
				{heroImage ? (
					<Image
						src={heroImage}
						alt=""
						aria-hidden="true"
						fill
						priority
						className={styles.heroImage}
						sizes="100vw"
					/>
				) : null}
				<div className={styles.heroScrim} aria-hidden="true" />
				<RippleField className={styles.heroRipple} particleCount={22} />

				<div className={styles.heroInner}>
					<div className={styles.heroCopy}>
						<p className={styles.eyebrow}>
							<span className={styles.liveDot} aria-hidden="true" />
							Opportunity formation system
						</p>
						<h1 id="home-hero-title" className={styles.heroTitle}>
							<RevealText text="Watch seasonal opportunity form." />
						</h1>
						<p className={styles.heroSummary}>
							Explore&amp;Earn connects seekers, hosts, places, housing, meals,
							pay, and timing into one premium discovery marketplace.
						</p>
						<div className={styles.heroActions}>
							<Link href="/seek" className={styles.primaryCta}>
								Start exploring
								<Icon name="action.forward" size={16} aria-hidden />
							</Link>
							<Link href="/for-hosts" className={styles.secondaryCta}>
								Host command center
							</Link>
						</div>
						<div className={styles.heroTriad} aria-label="Housing, meals, and pay are shown first">
							{(["housing", "meals", "pay"] as const).map((kind) => (
								<span key={kind}>
									<Icon name={`benefit.${kind}`} size={16} aria-hidden />
									<strong>{kind.toUpperCase()}</strong>
								</span>
							))}
						</div>
					</div>

					<div className={styles.heroSystem} aria-label="Marketplace ecosystem preview">
						<div className={styles.mapGlass}>
							<div className={styles.mapGrid} aria-hidden="true" />
							<FloatingMapPins pins={mapPins} />
							<div className={styles.flowPath} aria-hidden="true" />
						</div>

						{primaryListing ? (
							<div className={styles.heroCardPrimary}>
								<MiniOpportunityCard listing={primaryListing} />
							</div>
						) : null}

						{secondaryListing ? (
							<LiquidGlassPanel className={styles.compensationPanel} tone="deep" delay={0.16}>
								<span className={styles.panelLabel}>Compensation signal</span>
								<strong>{benefitSummary(secondaryListing, "pay")}</strong>
								<small>{benefitSummary(secondaryListing, "housing")} / {benefitSummary(secondaryListing, "meals")}</small>
							</LiquidGlassPanel>
						) : null}

						<LiquidGlassPanel className={styles.hostBadgePanel} tone="frost" delay={0.22}>
							<Icon name="trust.verified_host" size={20} aria-hidden />
							<span>
								<strong>{hostLead?.hostName ?? primaryListing?.host.name ?? "Verified hosts"}</strong>
								<small>{hostLead?.location ?? "Housing, meals, pay upfront"}</small>
							</span>
						</LiquidGlassPanel>
					</div>
				</div>

				{featuredListings.length > 0 ? (
					<FlowCardRail className={styles.heroRail} trackClassName={styles.heroRailTrack}>
						{featuredListings.map((listing) => (
							<MiniOpportunityCard key={listing.id} listing={listing} compact />
						))}
					</FlowCardRail>
				) : null}
			</section>

			<ScrollScene className={styles.flowScene} labelledBy="marketplace-flow-title">
				<div className={styles.sectionHead}>
					<p className={styles.eyebrow}>Marketplace flow</p>
					<h2 id="marketplace-flow-title">Cards separate by what actually matters.</h2>
					<p>
						The system organizes each opportunity by category, fit, housing,
						wage, location, and date, then lets the best matches move forward.
					</p>
				</div>

				<div className={styles.flowSteps} aria-label="Explore and Earn marketplace flow">
					{FLOW_STEPS.map((step, index) => (
						<div key={step.label} className={styles.flowStep} style={{ "--step-index": index } as CSSProperties}>
							<span><Icon name={step.icon} size={16} aria-hidden /></span>
							<strong>{step.label}</strong>
						</div>
					))}
				</div>

				<div className={styles.dimensionGrid}>
					{FILTER_DIMENSIONS.map((dimension, index) => (
						<DimensionCard key={dimension.label} {...dimension} index={index} />
					))}
				</div>

				{featuredListings.length > 0 ? (
					<FlowCardRail className={styles.marketRail} trackClassName={styles.marketRailTrack}>
						{featuredListings.concat(featuredListings.slice(0, 2)).map((listing, index) => (
							<MiniOpportunityCard key={`${listing.id}-${index}`} listing={listing} compact />
						))}
					</FlowCardRail>
				) : null}
			</ScrollScene>

			<MotionSection className={styles.journeyScene} labelledBy="seeker-journey-title">
				<div className={styles.sectionHead}>
					<p className={styles.eyebrow}>Seeker journey</p>
					<h2 id="seeker-journey-title">A profile becomes a path.</h2>
					<p>
						Skills, preferences, readiness, location, and saved jobs connect
						to roles that are realistic to take.
					</p>
				</div>

				<div className={styles.journeyGrid}>
					<LiquidGlassPanel className={styles.profilePanel} tone="deep">
						<div className={styles.profileTop}>
							<span className={styles.profileAvatar}>S</span>
							<span>
								<strong>Seeker profile</strong>
								<small>Adventure-ready / seasonal / verified basics</small>
							</span>
						</div>
						<div className={styles.signalStack}>
							{SEEKER_SIGNALS.map((signal) => (
								<SignalNode key={signal.label} {...signal} />
							))}
						</div>
					</LiquidGlassPanel>

					<div className={styles.matchColumn}>
						{featuredListings.slice(0, 3).map((listing, index) => (
							<LiquidGlassPanel key={listing.id} className={styles.matchCard} tone="frost" delay={index * 0.05}>
								<span className={styles.matchScore}>{listing.matchScore ?? 82}%</span>
								<span>
									<strong>{listing.title}</strong>
									<small>{listing.location} / {listing.opportunityWindow}</small>
								</span>
								<Icon name="status.match" size={20} aria-hidden />
							</LiquidGlassPanel>
						))}
					</div>
				</div>
			</MotionSection>

			<MotionSection className={styles.hostScene} labelledBy="host-os-title">
				<div className={styles.sectionHead}>
					<p className={styles.eyebrow}>Host operating system</p>
					<h2 id="host-os-title">Hosts get a precise hiring command center.</h2>
					<p>
						Listings, applicants, verification, boosted placement, and offers
						assemble into one controlled operating layer.
					</p>
				</div>

				<LiquidGlassPanel className={styles.hostConsole} tone="deep">
					<div className={styles.consoleHeader}>
						<span>
							<strong>{hostLead?.hostName ?? "Summit Pass Hospitality"}</strong>
							<small>{hostLead?.location ?? "Breckenridge, Colorado"}</small>
						</span>
						<Link href="/for-hosts" className={styles.consoleLink}>
							Open host view
							<Icon name="action.forward" size={16} aria-hidden />
						</Link>
					</div>
					<div className={styles.consoleGrid}>
						{HOST_SYSTEM.map((item, index) => (
							<div key={item.label} className={styles.consoleTile} style={{ "--tile-index": index } as CSSProperties}>
								<Icon name={item.icon} size={20} aria-hidden />
								<span>{item.label}</span>
								<strong>{item.value}</strong>
							</div>
						))}
					</div>
					<div className={styles.pipeline} aria-label="Host hiring flow">
						{["Draft", "Live", "Review", "Offer", "Arrival"].map((stage, index) => (
							<span key={stage} className={index < 3 ? styles.pipelineActive : undefined}>
								{stage}
							</span>
						))}
					</div>
				</LiquidGlassPanel>
			</MotionSection>

			<MotionSection className={styles.trustScene} labelledBy="trust-title">
				<div className={styles.sectionHead}>
					<p className={styles.eyebrow}>Trust and verification</p>
					<h2 id="trust-title">The value triad locks before commitment.</h2>
					<p>
						Housing, meals, pay, employer quality, and safety signals stay
						visible as first-class product objects.
					</p>
				</div>

				<div className={styles.trustGrid}>
					{TRUST_SIGNALS.map((signal, index) => (
						<LiquidGlassPanel key={signal.label} className={styles.trustCard} tone={index < 3 ? "frost" : "clear"} delay={index * 0.04}>
							<Icon name={signal.icon} size={24} aria-hidden />
							<strong>{signal.label}</strong>
							<span>{signal.value}</span>
						</LiquidGlassPanel>
					))}
				</div>
			</MotionSection>

			<MotionSection className={styles.finalCta} labelledBy="final-cta-title">
				<RippleField className={styles.finalRipple} particleCount={16} />
				<LiquidGlassPanel className={styles.finalPanel} tone="deep">
					<p className={styles.eyebrow}>System ready</p>
					<h2 id="final-cta-title">Opportunity is ready to move.</h2>
					<p>
						Step into a marketplace where the place, the work, the host, and
						the real conditions arrive together.
					</p>
					<div className={styles.heroActions}>
						<Link href="/seek" className={styles.primaryCta}>
							Explore roles
							<Icon name="action.forward" size={16} aria-hidden />
						</Link>
						<Link href="/for-hosts" className={styles.secondaryCta}>
							Bring your season
						</Link>
					</div>
				</LiquidGlassPanel>
			</MotionSection>
		</div>
	);
}
