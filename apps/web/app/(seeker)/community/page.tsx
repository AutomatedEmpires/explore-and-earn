import type { Metadata } from "next";

import { auth, currentUser } from "@clerk/nextjs/server";

import {
	CommunityDashboard,
	getMatchedListings,
	getSeekerStatus,
} from "../../../components/seeker";
import { buildFeaturedEmployers } from "../../../lib/employer-utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	title: "Community · Feed",
	description: "Photos, announcements, and stories from the Explore & Earn community — seekers and hosts sharing seasonal work adventures.",
	robots: { index: false },
	openGraph: {
		title: "Community Feed · Explore & Earn",
		description: "Photos, announcements, and stories from the Explore & Earn community.",
		type: "website",
	},
};

export default async function SeekerCommunityPage() {
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
			tab="feed"
			status={status}
			listings={matchedListings}
			featuredEmployers={featuredEmployers}
		/>
	);
}