import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { getApplicationsForSeekerWithListings } from "@explore-and-earn/db";

import {
	BucketPage,
	JourneyTimeline,
	type JourneyStop,
	type JourneyStatus,
} from "../../../components/seeker";

export const metadata: Metadata = {
	title: "Journey",
};

export const dynamic = "force-dynamic";

function computeJourneyStatus(beginsAt: string | null, endsAt: string | null): JourneyStatus {
	const now = Date.now();
	const begins = beginsAt ? new Date(beginsAt).getTime() : null;
	const ends = endsAt ? new Date(endsAt).getTime() : null;

	if (ends !== null && !Number.isNaN(ends) && ends < now) return "completed";
	if (begins !== null && !Number.isNaN(begins) && begins <= now) return "in_progress";
	return "upcoming";
}

export default async function JourneyPage() {
	const { userId, getToken } = await auth();
	const token = userId ? await getToken({ template: "supabase" }) : null;

	let stops: JourneyStop[] = [];

	if (userId && token) {
		const applications = await getApplicationsForSeekerWithListings(token, userId).catch(() => []);
		stops = applications
			.filter((app) => app.status === "accepted" && app.listing !== null)
			.map((app): JourneyStop => ({
				id: app.id,
				title: app.listing!.title,
				location: app.listing!.location,
				category: app.listing!.category,
				dateRange: app.listing!.opportunityWindow,
				status: computeJourneyStatus(app.listing!.beginsAt, app.listing!.endsAt),
			}));
		// Sort: in_progress first, then upcoming (soonest first), then completed (most recent first)
		stops.sort((a, b) => {
			const order: Record<JourneyStatus, number> = { in_progress: 0, upcoming: 1, completed: 2 };
			return order[a.status] - order[b.status];
		});
	}

	return (
		<BucketPage
			title="Journey map"
			description="Where you've been and where you're headed."
		>
			<JourneyTimeline stops={stops} />
		</BucketPage>
	);
}
