import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { DiscoveryCard } from "@explore-and-earn/ui";
import { getApplicationsForSeekerWithListings } from "@explore-and-earn/db";

import { BucketPage, CardStatus } from "../../../../components/seeker";
import { EmptyState, seekerApplicationListingToCardData } from "../../../../components/discovery";
import styles from "./withdrawn.module.css";

export const metadata: Metadata = {
	title: "Withdrawn",
};

export const dynamic = "force-dynamic";

export default async function WithdrawnPage() {
	const { userId, getToken } = await auth();
	const token = userId ? await getToken() : null;

	if (!userId || !token) {
		return (
			<BucketPage
				title="Withdrawn"
				description="Applications you withdrew from."
			>
				<EmptyState
					title="Sign in to see your withdrawn applications"
					message="Sign in to see the applications you have withdrawn from."
				/>
			</BucketPage>
		);
	}

	const applications = await getApplicationsForSeekerWithListings(token, userId).catch(() => []);
	const withdrawn = applications.filter(
		(app) => app.status === "withdrawn" && app.listing !== null,
	);

	return (
		<BucketPage
			title="Withdrawn"
			description="Applications you withdrew from."
		>
			{withdrawn.length > 0 ? (
				<div className={styles.grid}>
					{withdrawn.map((application) => {
						const { listing } = application;
						if (!listing) return null;
						const withdrawnOn = application.submittedAt
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
								cardState="withdrawn"
								actions={
									<CardStatus
										icon="action.close"
										label="Withdrawn"
										detail={withdrawnOn ? `Applied ${withdrawnOn}` : undefined}
									/>
								}
							/>
						);
					})}
				</div>
			) : (
				<EmptyState
					illustration="empty.withdrawn"
					title="No withdrawn applications"
					message="Applications you pull back from will appear here. Keep exploring opportunities under Seek."
					actionLabel="Explore opportunities"
					actionHref="/seek"
				/>
			)}
		</BucketPage>
	);
}
