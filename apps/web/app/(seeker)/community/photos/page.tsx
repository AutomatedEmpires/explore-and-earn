import type { Metadata } from "next";

import { auth, currentUser } from "@clerk/nextjs/server";

import {
	CommunityDashboard,
	getMatchedListings,
	getSeekerStatus,
} from "../../../../components/seeker";
import { buildFeaturedEmployers } from "../../../../lib/employer-utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	title: "Community · Photos",
	description: "Photos from seekers and hosts in the Explore & Earn community — real moments from farm, maritime, and seasonal work adventures.",
	robots: { index: false },
	openGraph: {
		title: "Community Photos · Explore & Earn",
		description: "Real moments from the Explore & Earn community.",
		type: "website",
	},
};

export default async function CommunityPhotosPage() {
	const { userId, getToken } = await auth();
	const token = userId ? await getToken({ template: "supabase" }) : null;
	const user = userId ? await currentUser() : null;
	const fallbackName = user?.firstName ?? null;

	const [status, matchedListings] = await Promise.all([
		getSeekerStatus(token, userId, fallbackName),
		getMatchedListings(token, userId),
	]);

	const featuredEmployers = buildFeaturedEmployers(matchedListings);

	return (
		<CommunityDashboard
			tab="photos"
			status={status}
			listings={matchedListings}
			featuredEmployers={featuredEmployers}
		/>
	);
}
