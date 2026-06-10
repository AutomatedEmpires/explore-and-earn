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
	title: "Community · Announcements",
	description: "Host announcements in the Explore & Earn community — seasonal openings, housing updates, and hiring news from verified hosts.",
	robots: { index: false },
	openGraph: {
		title: "Community Announcements · Explore & Earn",
		description: "Seasonal openings and hiring announcements from verified Explore & Earn hosts.",
		type: "website",
	},
};

export default async function CommunityAnnouncementsPage() {
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
			tab="announcements"
			status={status}
			listings={matchedListings}
			featuredEmployers={featuredEmployers}
		/>
	);
}
