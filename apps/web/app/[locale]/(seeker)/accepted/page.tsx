import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { DiscoveryCard, Icon } from "@explore-and-earn/ui";
import {
	getApplicationsForSeekerWithListings,
	type SeekerApplicationListing,
	type SeekerApplicationWithListing,
} from "@explore-and-earn/db";

import { BucketPage, CardStatus } from "../../../../components/seeker";
import {
	ACCEPTED_ITEMS,
	DEV_ACCEPTED_APPLICATION_ID,
	DEV_ACCEPTED_BEGINS_AT,
	DEV_ACCEPTED_ENDS_AT,
} from "../../../../components/seeker/fixtures";
import {
	CATEGORY_ICON,
	EmptyState,
	seekerApplicationListingToCardData,
} from "../../../../components/discovery";
import { isDevBenchEnabled } from "../../../../lib/devBench";
import { readDevRole } from "../../../../lib/devBench/server";
import styles from "./accepted.module.css";

export const metadata: Metadata = {
	title: "Accepted",
};

// Per-seeker application data must never be statically cached.
export const dynamic = "force-dynamic";

/**
 * Whole-day delta between now and a start date. Rounds on calendar-day
 * boundaries so "starts in N days" never drifts by wall-clock hours.
 * Returns null when the date is missing or unparseable — the hero then omits
 * the countdown entirely rather than inventing one.
 */
function daysUntilStart(beginsAt: string | null): number | null {
	if (!beginsAt) return null;
	const start = new Date(beginsAt);
	if (Number.isNaN(start.getTime())) return null;
	const startDay = Date.UTC(
		start.getUTCFullYear(),
		start.getUTCMonth(),
		start.getUTCDate(),
	);
	const now = new Date();
	const today = Date.UTC(
		now.getUTCFullYear(),
		now.getUTCMonth(),
		now.getUTCDate(),
	);
	return Math.round((startDay - today) / 86_400_000);
}

/** Honest, human countdown from a real start date (or null to omit). */
function countdownLabel(days: number | null): string | null {
	if (days === null) return null;
	if (days < 0) return "Season underway";
	if (days === 0) return "Starts today";
	if (days === 1) return "Starts tomorrow";
	return `Starts in ${days} days`;
}

function formatStartDate(beginsAt: string | null): string | null {
	if (!beginsAt) return null;
	const start = new Date(beginsAt);
	if (Number.isNaN(start.getTime())) return null;
	return start.toLocaleDateString("en-US", {
		month: "long",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	});
}

/**
 * Celebratory "next departure" band for the soonest-starting confirmed role.
 * Every value comes from real listing data; anything missing is simply omitted.
 */
function NextDepartureHero({ listing }: { readonly listing: SeekerApplicationListing }) {
	const days = daysUntilStart(listing.beginsAt);
	const countdown = countdownLabel(days);
	const startDate = formatStartDate(listing.beginsAt);
	const timeframe = startDate ?? listing.opportunityWindow;

	const triad: { icon: "benefit.housing" | "benefit.meals" | "benefit.pay"; label: string }[] = [];
	if (listing.benefits.housing.provision === "provided") {
		triad.push({ icon: "benefit.housing", label: "Housing provided" });
	}
	if (listing.benefits.meals.provision === "provided") {
		triad.push({ icon: "benefit.meals", label: "Meals provided" });
	}
	if (listing.benefits.pay.provision === "provided") {
		triad.push({
			icon: "benefit.pay",
			label: listing.benefits.pay.summary ?? "Pay provided",
		});
	}

	return (
		<section className={styles.hero} aria-labelledby="next-departure-title">
			<div className={styles.heroHeader}>
				<span className={styles.heroEyebrow}>
					<Icon name="status.accepted" size={16} aria-hidden />
					Next departure
				</span>
				{countdown ? <span className={styles.heroCountdown}>{countdown}</span> : null}
			</div>
			<h2 id="next-departure-title" className={styles.heroTitle}>
				{listing.title}
			</h2>
			<p className={styles.heroHost}>{listing.host.name}</p>
			<div className={styles.heroFacts}>
				<span className={styles.heroFact}>
					<Icon name={CATEGORY_ICON[listing.category]} size={16} aria-hidden />
					{listing.location}
				</span>
				<span className={styles.heroFact}>
					<Icon name="status.begins" size={16} aria-hidden />
					{timeframe}
				</span>
			</div>
			{triad.length > 0 ? (
				<ul className={styles.heroTriad}>
					{triad.map((item) => (
						<li key={item.icon} className={styles.triadChip}>
							<Icon name={item.icon} size={16} aria-hidden />
							{item.label}
						</li>
					))}
				</ul>
			) : null}
		</section>
	);
}

/** Pick the soonest-starting accepted role: nearest future start, else earliest known start, else first. */
function pickNextDeparture(
	listings: readonly SeekerApplicationListing[],
): SeekerApplicationListing | null {
	if (listings.length === 0) return null;
	const dated = listings
		.filter((l) => daysUntilStart(l.beginsAt) !== null)
		.sort((a, b) => new Date(a.beginsAt as string).getTime() - new Date(b.beginsAt as string).getTime());
	const upcoming = dated.filter((l) => (daysUntilStart(l.beginsAt) ?? -1) >= 0);
	return upcoming[0] ?? dated[0] ?? listings[0];
}

/**
 * Honest local evidence for the accepted bucket. The listing is mapped from the
 * canonical Ski Resort Front Desk fixture; optional application fields stay
 * empty when that fixture has no evidence for them.
 */
function devAcceptedApplications(): SeekerApplicationWithListing[] {
	const item = ACCEPTED_ITEMS[0];
	if (!item) {
		throw new Error("Accepted page fixture requires an accepted item.");
	}

	const { listing } = item;
	return [
		{
			id: DEV_ACCEPTED_APPLICATION_ID,
			listingId: listing.id,
			status: "accepted",
			submittedAt: "2026-05-03T17:00:00.000Z",
			expiresAt: null,
			reviewedAt: "2026-05-05T17:00:00.000Z",
			coverMessage: null,
			listing: {
				id: listing.id,
				title: listing.title,
				category: listing.category,
				location: listing.location,
				opportunityWindow: listing.opportunityWindow,
				status: listing.status,
				host: {
					name: listing.host.name,
					verified: listing.host.verified,
				},
				benefits: listing.benefits,
				coverImageUrl: listing.coverImageUrl ?? null,
				beginsAt: DEV_ACCEPTED_BEGINS_AT,
				endsAt: DEV_ACCEPTED_ENDS_AT,
				conditionalBadges: listing.conditionalBadges,
				matchScore: listing.matchScore,
			},
		},
	];
}

export default async function AcceptedPage() {
	let applications: SeekerApplicationWithListing[];
	if (isDevBenchEnabled() && (await readDevRole()) === "seeker") {
		applications = devAcceptedApplications();
	} else {
		const { userId, getToken } = await auth();
		const token = userId ? await getToken() : null;

		if (!userId || !token) {
			return (
				<BucketPage
					title="Accepted"
					description="Your confirmed roles and pre-arrival steps."
				>
					<EmptyState
						title="Sign in to see your accepted roles"
						message="Sign in to see your confirmed roles and pre-arrival steps."
					/>
				</BucketPage>
			);
		}

		applications = await getApplicationsForSeekerWithListings(token, userId).catch(() => []);
	}
	const accepted = applications.filter(
		(app) => app.status === "accepted" && app.listing !== null,
	);

	const nextDeparture = pickNextDeparture(
		accepted.map((app) => app.listing).filter((l): l is SeekerApplicationListing => l !== null),
	);

	return (
		<BucketPage
			title="Accepted"
			description="Your confirmed roles and pre-arrival steps."
		>
			{accepted.length > 0 ? (
				<>
					{nextDeparture ? <NextDepartureHero listing={nextDeparture} /> : null}
					<div className={styles.grid}>
						{accepted.map((application) => {
							const { listing } = application;
							if (!listing) return null;
							const appliedOn = application.submittedAt
								? new Date(application.submittedAt).toLocaleDateString("en-US", {
									month: "long",
									day: "numeric",
								})
								: null;
							return (
								<DiscoveryCard
									key={application.id}
									data={seekerApplicationListingToCardData(listing)}
									surface="applied"
									cardState="accepted"
									actions={
										<div
											className={styles.cardActions}
											role="group"
											aria-label={`${listing.title} application actions`}
										>
											<CardStatus
												icon="system.success"
												label="Accepted"
												detail={appliedOn ? `Applied ${appliedOn}` : undefined}
											/>
											<Link
												className={styles.applicationLink}
												href={`/applied/${application.id}`}
											>
												View application
											</Link>
										</div>
									}
								/>
							);
						})}
					</div>
				</>
			) : (
				<EmptyState
					illustration="empty.accepted"
					title="No accepted roles yet"
					message="When you accept an offer, your upcoming role will live here. Keep exploring opportunities under Seek."
					actionLabel="Explore opportunities"
					actionHref="/seek"
				/>
			)}
		</BucketPage>
	);
}
