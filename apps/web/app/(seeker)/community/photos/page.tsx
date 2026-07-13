import type { Metadata } from "next";

import { auth, currentUser } from "@clerk/nextjs/server";
import { getFeedPhotos, getPhotoReactionsBatch, getSeekerCompletionScore } from "@explore-and-earn/db";

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
	const token = userId ? await getToken() : null;
	const user = userId ? await currentUser() : null;
	const fallbackName = user?.firstName ?? null;

	const [status, matchedListings, seekerIdentity] = await Promise.all([
		getSeekerStatus(token, userId, fallbackName),
		getMatchedListings(token, userId),
		token && userId ? getSeekerCompletionScore(token, userId).catch(() => null) : Promise.resolve(null),
	]);

	const featuredEmployers = buildFeaturedEmployers(matchedListings);

	let serverPhotos: Awaited<ReturnType<typeof getFeedPhotos>> | undefined;
	if (token) {
		try {
			serverPhotos = await getFeedPhotos(token);
			if (serverPhotos?.length && userId) {
				const rxMap = await getPhotoReactionsBatch(serverPhotos.map(p => p.id), userId).catch(() => new Map());
				serverPhotos = serverPhotos.map(p => ({ ...p, reactionCounts: rxMap.get(p.id) ?? p.reactionCounts }));
			}
		} catch { /* degrade gracefully */ }
	}

	return (
		<CommunityDashboard
			tab="photos"
			status={status}
			listings={matchedListings}
			featuredEmployers={featuredEmployers}
			serverPhotos={serverPhotos}
			completionScore={status.resumeCompletion}
			currentSeekerProfileId={seekerIdentity?.seekerProfileId ?? null}
		/>
	);
}
