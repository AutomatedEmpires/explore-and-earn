import type { Metadata } from "next";

import { auth, currentUser } from "@clerk/nextjs/server";
import {
	countHostAnnouncementsThisMonth,
	getAnnouncementReactionsBatch,
	getFeedAnnouncements,
	getFeedPhotos,
	getHostTierAndProfile,
	getPhotoReactionsBatch,
	getSeekerCompletionScore,
	markCommunitySeen,
} from "@explore-and-earn/db";

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
	const token = userId ? await getToken() : null;
	const user = userId ? await currentUser() : null;
	const fallbackName = user?.firstName ?? null;

	// Opening the feed clears the "N new" badge (best-effort, service-role).
	if (userId) await markCommunitySeen(userId);

	const [status, matchedListings] = await Promise.all([
		getSeekerStatus(token, userId, fallbackName),
		getMatchedListings(token, userId),
	]);

	const featuredEmployers = buildFeaturedEmployers(matchedListings);

	let serverPhotos: Awaited<ReturnType<typeof getFeedPhotos>> | undefined;
	let serverAnnouncements: Awaited<ReturnType<typeof getFeedAnnouncements>> | undefined;
	let hostIdentity: Awaited<ReturnType<typeof getHostTierAndProfile>> = null;
	let seekerIdentity: Awaited<ReturnType<typeof getSeekerCompletionScore>> = null;
	let hostUsedThisMonth = 0;

	if (token && userId) {
		const [photosResult, announcementsResult, hostResult, seekerResult] = await Promise.allSettled([
			getFeedPhotos(token),
			getFeedAnnouncements(token),
			getHostTierAndProfile(token, userId),
			getSeekerCompletionScore(token, userId),
		]);
		if (photosResult.status === "fulfilled") serverPhotos = photosResult.value;
		if (announcementsResult.status === "fulfilled") serverAnnouncements = announcementsResult.value;
		if (hostResult.status === "fulfilled") hostIdentity = hostResult.value;
		if (seekerResult.status === "fulfilled") seekerIdentity = seekerResult.value;

		// Enrich with real reaction counts
		if (serverPhotos?.length || serverAnnouncements?.length) {
			const [photoRxResult, annRxResult] = await Promise.allSettled([
				serverPhotos?.length
					? getPhotoReactionsBatch(serverPhotos.map(p => p.id), userId)
					: Promise.resolve(new Map()),
				serverAnnouncements?.length
					? getAnnouncementReactionsBatch(serverAnnouncements.map(a => a.id), userId)
					: Promise.resolve(new Map()),
			]);
			if (photoRxResult.status === "fulfilled" && serverPhotos) {
				serverPhotos = serverPhotos.map(p => ({ ...p, reactionCounts: photoRxResult.value.get(p.id) ?? p.reactionCounts }));
			}
			if (annRxResult.status === "fulfilled" && serverAnnouncements) {
				serverAnnouncements = serverAnnouncements.map(a => ({ ...a, reactionCounts: annRxResult.value.get(a.id) ?? a.reactionCounts }));
			}
		}

		if (hostIdentity) {
			try {
				hostUsedThisMonth = await countHostAnnouncementsThisMonth(token, hostIdentity.hostProfileId);
			} catch { /* degrade gracefully */ }
		}
	}

	return (
		<CommunityDashboard
			tab="feed"
			status={status}
			listings={matchedListings}
			featuredEmployers={featuredEmployers}
			serverPhotos={serverPhotos}
			serverAnnouncements={serverAnnouncements}
			completionScore={status.resumeCompletion}
			isHost={Boolean(hostIdentity)}
			hostTier={hostIdentity?.subscriptionTier}
			hostUsedThisMonth={hostUsedThisMonth}
			hostDraftAnnouncementId={null}
			currentSeekerProfileId={seekerIdentity?.seekerProfileId ?? null}
		/>
	);
}
