import type { Metadata } from "next";

import { auth, currentUser } from "@clerk/nextjs/server";
import {
	getSeekerApplications,
	getSeekerBadges,
	getSeekerProfile,
	getSeekerResume,
	type SeekerBadge,
} from "@explore-and-earn/db";

import { DISCOVERY_FIXTURES } from "../../../../components/discovery";
import {
	ProfileHub,
	computeResumeCompletion,
	getSeekerStatusFallback,
	type SeekerStatusSummary,
} from "../../../../components/seeker";
import { getMatchedListings } from "../../../../components/seeker/data";
import { buildFeaturedEmployers } from "../../../../lib/employer-utils";

export const metadata: Metadata = {
	title: "Profile",
};

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
	const { userId, getToken } = await auth();

	let status: SeekerStatusSummary = getSeekerStatusFallback();
	let badges: SeekerBadge[] = [];
	let profilePhotoUrl: string | null = null;
	let heroCoverUrl: string | null = null;
	let seekingTimeline: string | null = null;
	let preferredCategories: string[] = [];
	let bio: string | null = null;
	let seekerProfileId: string | null = null;
	let matchedListings: Awaited<ReturnType<typeof getMatchedListings>> = [];

	if (userId) {
		let seekerName = status.seekerName;
		try {
			const user = await currentUser();
			const fullName = user?.fullName?.trim();
			seekerName =
				fullName && fullName.length > 0
					? fullName
					: user?.firstName?.trim() ||
						user?.username?.trim() ||
						status.seekerName;
		} catch {
			// currentUser() failed — keep fixture name
		}

		let appliedCount = status.appliedCount;
		let resumeCompletion = status.resumeCompletion;
		try {
			const token = await getToken();
			if (token) {
				const [apps, resume, earnedBadges, profile, matched] = await Promise.all([
					getSeekerApplications(token, userId),
					getSeekerResume(token, userId),
					getSeekerBadges(token, userId),
					getSeekerProfile(token, userId),
					getMatchedListings(token, userId),
				]);

				appliedCount = apps.length;
				resumeCompletion = computeResumeCompletion(resume);
				badges = earnedBadges;
				matchedListings = matched.slice(0, 12);

				if (profile) {
					profilePhotoUrl = profile.profilePhotoUrl ?? null;
					heroCoverUrl = profile.heroCoverUrl ?? null;
					seekingTimeline = profile.seekingTimeline ?? null;
					preferredCategories = profile.desiredCategories ?? [];
					bio = profile.shortBio ?? null;
					seekerProfileId = profile.id ?? null;
				}
			}
		} catch {
			// DB unavailable — keep fixture values
		}

		status = { ...status, seekerName, appliedCount, resumeCompletion };
	}

	// Employer strip: real matched inventory in production (fixture employers'
	// lst_* links cannot resolve there); fixtures for preview fullness only.
	const featuredEmployers = buildFeaturedEmployers(
		process.env.NODE_ENV !== "production" ? DISCOVERY_FIXTURES : matchedListings,
	);

	return (
		<ProfileHub
			status={status}
			badges={badges}
			profilePhotoUrl={profilePhotoUrl}
			heroCoverUrl={heroCoverUrl}
			seekingTimeline={seekingTimeline}
			preferredCategories={preferredCategories}
			bio={bio}
			seekerProfileId={seekerProfileId}
			matchedListings={matchedListings}
			featuredEmployers={featuredEmployers}
		/>
	);
}
