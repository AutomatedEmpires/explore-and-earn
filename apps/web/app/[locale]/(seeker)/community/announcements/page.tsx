import type { Metadata } from "next";

import { auth, currentUser } from "@clerk/nextjs/server";
import {
	countHostAnnouncementsThisMonth,
	getAnnouncementReactionsBatch,
	getFeedAnnouncements,
	getHostTierAndProfile,
	getLatestDraftAnnouncement,
} from "@explore-and-earn/db";

import {
	CommunityDashboard,
	getMatchedListings,
	getSeekerStatus,
} from "../../../../../components/seeker";
import { buildFeaturedEmployers } from "../../../../../lib/employer-utils";

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

export default async function CommunityAnnouncementsPage({
	searchParams,
}: {
	searchParams: Promise<{ purchased?: string }>;
}) {
	const { purchased } = await searchParams;
	const { userId, getToken } = await auth();
	const token = userId ? await getToken() : null;
	const user = userId ? await currentUser() : null;
	const fallbackName = user?.firstName ?? null;

	const [status, matchedListings] = await Promise.all([
		getSeekerStatus(token, userId, fallbackName),
		getMatchedListings(token, userId),
	]);

	const featuredEmployers = buildFeaturedEmployers(matchedListings);

	let serverAnnouncements: Awaited<ReturnType<typeof getFeedAnnouncements>> | undefined;
	let hostIdentity: Awaited<ReturnType<typeof getHostTierAndProfile>> = null;
	let hostUsedThisMonth = 0;
	let hostDraftAnnouncementId: string | null = null;

	if (token && userId) {
		const [announcementsResult, hostResult] = await Promise.allSettled([
			getFeedAnnouncements(token),
			getHostTierAndProfile(token, userId),
		]);
		if (announcementsResult.status === "fulfilled") serverAnnouncements = announcementsResult.value;
		if (hostResult.status === "fulfilled") hostIdentity = hostResult.value;

		// Enrich with real reaction counts
		if (serverAnnouncements?.length) {
			const rxMap = await getAnnouncementReactionsBatch(serverAnnouncements.map(a => a.id), userId).catch(() => new Map());
			serverAnnouncements = serverAnnouncements.map(a => ({ ...a, reactionCounts: rxMap.get(a.id) ?? a.reactionCounts }));
		}

		if (hostIdentity) {
			const [usageResult, draftResult] = await Promise.allSettled([
				countHostAnnouncementsThisMonth(token, hostIdentity.hostProfileId),
				purchased === "1"
					? getLatestDraftAnnouncement(token, hostIdentity.hostProfileId)
					: Promise.resolve(null),
			]);
			if (usageResult.status === "fulfilled") hostUsedThisMonth = usageResult.value;
			if (draftResult.status === "fulfilled") hostDraftAnnouncementId = draftResult.value;
		}
	}

	return (
		<CommunityDashboard
			tab="announcements"
			status={status}
			listings={matchedListings}
			featuredEmployers={featuredEmployers}
			serverAnnouncements={serverAnnouncements}
			completionScore={status.resumeCompletion}
			isHost={Boolean(hostIdentity)}
			hostTier={hostIdentity?.subscriptionTier}
			hostUsedThisMonth={hostUsedThisMonth}
			hostDraftAnnouncementId={hostDraftAnnouncementId}
		/>
	);
}
