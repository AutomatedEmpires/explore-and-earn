import type { Metadata } from "next";

import { auth } from "@clerk/nextjs/server";
import { getSeekerResume } from "@explore-and-earn/db";

import { EmptyState } from "../../../components/discovery";
import {
	BucketPage,
	ResumePanel,
	toResumeProgress,
} from "../../../components/seeker";

export const metadata: Metadata = {
	title: "Resume",
};

// Resume data is per-user, so this page must never be statically cached.
export const dynamic = "force-dynamic";

const RESUME_DESCRIPTION = "Your visual, tag-based compatibility profile.";

function SignedOutResume() {
	return (
		<BucketPage title="Resume" description={RESUME_DESCRIPTION}>
			<EmptyState
				title="Sign in to build your resume"
				message="Sign in to add your bio, experience, and education."
			/>
		</BucketPage>
	);
}

export default async function ResumePage() {
	const { userId, getToken } = await auth();

	if (!userId) {
		return <SignedOutResume />;
	}

	const token = await getToken({ template: "supabase" });
	if (!token) {
		return <SignedOutResume />;
	}

	const resume = await getSeekerResume(token, userId);
	const progress = toResumeProgress(resume);

	return (
		<BucketPage title="Resume" description={RESUME_DESCRIPTION}>
			<ResumePanel progress={progress} />
		</BucketPage>
	);
}
