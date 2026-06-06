import type { Metadata } from "next";

import { auth, currentUser } from "@clerk/nextjs/server";
import { getSeekerApplications, getSeekerResume } from "@explore-and-earn/db";

import {
	BucketPage,
	ProfileHub,
	SEEKER_STATUS,
	computeResumeCompletion,
	type SeekerStatusSummary,
} from "../../../components/seeker";

export const metadata: Metadata = {
	title: "Profile",
};

// Identity + pipeline counts are per-user, so this page must never be cached.
export const dynamic = "force-dynamic";

/**
 * Profile — founder-locked seeker-nav tab. The unified profile hub: identity,
 * pipeline snapshot, resume readiness, and links to every seeker surface.
 *
 * Shows the signed-in seeker's real name (Clerk), real application count, and
 * real resume completion (Supabase). Fields without a real source yet
 * (saved/offer counts, notifications) fall back to the SEEKER_STATUS fixture,
 * and the whole page degrades to the fixture if Clerk/DB reads fail — it must
 * render, not crash.
 */
export default async function ProfilePage() {
	const { userId, getToken } = await auth();

	let status: SeekerStatusSummary = SEEKER_STATUS;

	if (userId) {
		let seekerName = SEEKER_STATUS.seekerName;
		try {
			const user = await currentUser();
			const fullName = user?.fullName?.trim();
			seekerName =
				fullName && fullName.length > 0
					? fullName
					: user?.firstName?.trim() ||
						user?.username?.trim() ||
						SEEKER_STATUS.seekerName;
		} catch {
			// currentUser() failed — keep the fixture name rather than crash.
		}

		let appliedCount = SEEKER_STATUS.appliedCount;
		let resumeCompletion = SEEKER_STATUS.resumeCompletion;
		try {
			const token = await getToken({ template: "supabase" });
			if (token) {
				appliedCount = (await getSeekerApplications(token, userId)).length;
				resumeCompletion = computeResumeCompletion(
					await getSeekerResume(token, userId),
				);
			}
		} catch {
			// Pipeline / resume reads unavailable — keep the fixture values.
		}

		status = { ...SEEKER_STATUS, seekerName, appliedCount, resumeCompletion };
	}

	return (
		<BucketPage
			title="Profile"
			description="Your seeker profile, resume, and account settings."
		>
			<ProfileHub status={status} />
		</BucketPage>
	);
}
