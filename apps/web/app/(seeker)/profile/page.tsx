import type { Metadata } from "next";

import { auth } from "@clerk/nextjs/server";
import { getSeekerProfile, type SeekerProfile } from "@explore-and-earn/db";

import {
	BucketPage,
	ProfileHub,
	ProfileView,
	SEEKER_STATUS,
} from "../../../components/seeker";
import { updateProfile } from "../../actions/seeker";

export const metadata: Metadata = {
	title: "Profile",
};

// Reads per-request Clerk auth; never statically cache.
export const dynamic = "force-dynamic";

async function loadProfile(): Promise<SeekerProfile | null> {
	const { userId, getToken } = await auth();
	if (!userId) {
		return null;
	}
	const token = await getToken();
	if (!token) {
		return null;
	}
	return getSeekerProfile(token);
}

/**
 * Profile — founder-locked seeker-nav tab. Now backed by live data: the
 * editable identity card (ProfileView + ProfileEditor) sits above the existing
 * ProfileHub navigation, which is preserved unchanged. The hub's pipeline
 * snapshot still uses UI-only fixtures until the lifecycle contracts land.
 *
 * Do-not-deploy until RLS (A-RLS-001) is active: with RLS off, row scoping is
 * enforced in app code by the JWT `sub` (see packages/db seeker-profile.ts).
 */
export default async function ProfilePage() {
	const profile = await loadProfile();

	return (
		<BucketPage
			title="Profile"
			description="Your seeker profile, resume, and account settings."
		>
			<ProfileView profile={profile} updateProfile={updateProfile} />
			<ProfileHub status={SEEKER_STATUS} />
		</BucketPage>
	);
}
