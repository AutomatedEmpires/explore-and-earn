import type { Metadata } from "next";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { getConversations } from "@explore-and-earn/db";

import { EmptyState } from "../../../../components/discovery";
import { SeekerDashboard } from "../../../../components/seeker/SeekerDashboard";
import {
	getMatchedListings,
	getSeekerStatus,
} from "../../../../components/seeker/data";
import { buildFeaturedEmployers } from "../../../../lib/employer-utils";
import { cachedSeekerProfile, getSupabaseToken } from "../../../../lib/serverCache";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	title: "Your season",
	description:
		"Where your search stands: saved roles, applications, messages, and the one thing worth doing next.",
	robots: { index: false, follow: false },
};

/**
 * /home — the seeker dashboard (V2-G requirement 5).
 *
 * WHAT THIS ROUTE USED TO BE. A permanent redirect to /profile, written when
 * the dashboard was folded into /seek. That fold is what this phase undoes: a
 * dashboard rendered above the search results meant the marketplace's search
 * surface opened on a welcome banner, a readiness slider and a pipeline, with
 * the first listing below all of it. Discovery and status are different jobs;
 * they now have different addresses.
 *
 * DISTINCT FROM DISCOVERY, BY CONSTRUCTION. Nothing on this page renders a
 * feed, a deck or a map. Seek, Swipe and Map appear as three LINKS (see
 * DISCOVERY_MODES in SeekerDashboard) so the dashboard cannot swallow them
 * again — an embed is one refactor away from becoming the page; a link is not.
 *
 * EVERY NUMBER IS REAL. Saved, applications, offers and unread messages come
 * from the seeker's own rows. A read that fails degrades that one number with
 * the rest of the page intact, never to a placeholder that looks like data.
 */
export default async function SeekerHomePage() {
	const { userId } = await auth();
	if (!userId) {
		// The whole page is per-seeker state; there is nothing to show a visitor
		// who has not signed in, and the seeker gateway is the honest destination.
		redirect("/for-seekers");
	}

	const token = await getSupabaseToken();
	if (!token) {
		return (
			<EmptyState
				title="We couldn't load your season"
				message="You're signed in, but we couldn't reach your data just now. Reload in a moment — nothing has been lost."
				actionLabel="Browse opportunities"
				actionHref="/seek"
			/>
		);
	}

	const clerkUser = await currentUser();
	const fallbackName = clerkUser?.firstName
		? [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ")
		: "Seeker";

	// Independent reads, independently degradable: one slow or failing axis must
	// not blank the other three. allSettled rather than all for exactly that.
	const [statusResult, matchedResult, profileResult, conversationsResult] =
		await Promise.allSettled([
			getSeekerStatus(token, userId, fallbackName),
			getMatchedListings(token, userId),
			cachedSeekerProfile(token, userId),
			// A COUNT OF THREADS, NOT OF UNREAD MESSAGES. There is no seeker-side
			// unread reader — getUnreadMessageCount resolves a HOST profile and
			// would silently return 0 for every seeker, which is a fabricated
			// "you're all caught up". The dashboard therefore counts what it can
			// actually see and labels it "Conversations".
			getConversations(token, userId, "seeker"),
		]);

	const status =
		statusResult.status === "fulfilled"
			? statusResult.value
			: {
					seekerName: fallbackName,
					resumeCompletion: 0,
					savedCount: 0,
					appliedCount: 0,
					offersCount: 0,
					acceptedCount: 0,
					unreadNotifications: 0,
					invitesCount: 0,
				};
	const matchedListings =
		matchedResult.status === "fulfilled" ? matchedResult.value : [];
	const profile = profileResult.status === "fulfilled" ? profileResult.value : null;
	const conversationCount =
		conversationsResult.status === "fulfilled" ? conversationsResult.value.length : 0;

	return (
		<SeekerDashboard
			profile={profile}
			status={status}
			matchedListings={matchedListings.slice(0, 12)}
			seekerName={status.seekerName}
			conversationCount={conversationCount}
			featuredEmployers={buildFeaturedEmployers(matchedListings)}
		/>
	);
}
