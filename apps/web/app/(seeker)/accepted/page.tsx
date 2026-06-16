import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { DiscoveryCard } from "@explore-and-earn/ui";
import { getApplicationsForSeekerWithListings } from "@explore-and-earn/db";

import { BucketPage, CardStatus } from "../../../components/seeker";
import { EmptyState, seekerApplicationListingToCardData } from "../../../components/discovery";
import styles from "./accepted.module.css";

export const metadata: Metadata = {
	title: "Accepted",
};

// Per-seeker application data must never be statically cached.
export const dynamic = "force-dynamic";

export default async function AcceptedPage() {
	const { userId, getToken } = await auth();
	const token = userId ? await getToken({ template: "supabase" }) : null;

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

	const applications = await getApplicationsForSeekerWithListings(token, userId).catch(() => []);
	const accepted = applications.filter(
		(app) => app.status === "accepted" && app.listing !== null,
	);

	return (
		<BucketPage
			title="Accepted"
			description="Your confirmed roles and pre-arrival steps."
		>
			{accepted.length > 0 ? (
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
									<CardStatus
										icon="system.success"
										label="Accepted"
										detail={appliedOn ? `Applied ${appliedOn}` : undefined}
									/>
								}
							/>
						);
					})}
				</div>
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
