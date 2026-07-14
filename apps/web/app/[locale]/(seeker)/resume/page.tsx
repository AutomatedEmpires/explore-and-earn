import type { Metadata } from "next";

import { auth } from "@clerk/nextjs/server";
import { getSeekerResume } from "@explore-and-earn/db";

import { EmptyState } from "../../../../components/discovery";
import {
	BucketPage,
	ResumeBuilder,
	computeResumeCompletion,
} from "../../../../components/seeker";

export const metadata: Metadata = {
	title: "Resume",
};

export const dynamic = "force-dynamic";

const RESUME_DESCRIPTION = "Build your compatibility profile — hosts see this when you apply.";

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

	const token = await getToken();
	if (!token) {
		return <SignedOutResume />;
	}

	const resume = await getSeekerResume(token, userId);
	const completion = computeResumeCompletion(resume);

	return (
		<BucketPage title="Resume" description={RESUME_DESCRIPTION}>
			<ResumeBuilder resume={resume} completion={completion} />
		</BucketPage>
	);
}
