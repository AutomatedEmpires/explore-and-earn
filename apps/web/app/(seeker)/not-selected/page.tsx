import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { DiscoveryCard } from "@explore-and-earn/ui";
import { getApplicationsForSeekerWithListings } from "@explore-and-earn/db";

import { BucketPage, CardStatus } from "../../../components/seeker";
import { EmptyState, seekerApplicationListingToCardData } from "../../../components/discovery";
import styles from "../../../components/seeker/LifecycleList.module.css";

export const metadata: Metadata = {
	title: "Not selected",
};

// Per-seeker application data must never be statically cached.
export const dynamic = "force-dynamic";

export default async function NotSelectedPage() {
	const { userId, getToken } = await auth();
	const token = userId ? await getToken({ template: "supabase" }) : null;

	if (!userId || !token) {
		return (
			<BucketPage
				title="Not selected"
				description="Closure without the noise — explore similar opportunities."
			>
				<EmptyState
					title="Sign in to see your applications"
					message="Sign in to see the applications that have closed."
				/>
			</BucketPage>
		);
	}

	const applications = await getApplicationsForSeekerWithListings(token, userId).catch(() => []);
	const notSelected = applications
		.filter(
			(app) =>
				(app.status === "not_selected" || app.status === "rejected") &&
				app.listing !== null,
		)
		.map((app) =>
			app.status === "rejected" ? { ...app, status: "not_selected" } : app,
		);

	return (
		<BucketPage
			title="Not selected"
			description="Closure without the noise — explore similar opportunities."
		>
			{notSelected.length > 0 ? (
				<div className={styles.grid}>
					{notSelected.map((application) => {
						const { listing } = application;
						if (!listing) return null;
						return (
							<DiscoveryCard
								key={application.id}
								data={seekerApplicationListingToCardData(listing)}
								surface="applied"
								cardState="not_selected"
								actions={
									<CardStatus
										icon="action.close"
										label="Not selected"
									/>
								}
							/>
						);
					})}
				</div>
			) : (
				<EmptyState
					title="Nothing here"
					message="Roles that didn't work out will be listed here, quietly and respectfully. Keep exploring opportunities under Seek."
				/>
			)}
		</BucketPage>
	);
}
