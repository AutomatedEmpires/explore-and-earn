import type { Metadata } from "next";

import { auth } from "@clerk/nextjs/server";
import { getSeekerResume, type SeekerResume } from "@explore-and-earn/db";

import { EmptyState } from "../../../components/discovery";
import {
	BucketPage,
	ResumeBuilder,
	computeResumeCompletion,
} from "../../../components/seeker";

export const metadata: Metadata = {
	title: "Resume",
};

export const dynamic = "force-dynamic";

const RESUME_DESCRIPTION = "Build your compatibility profile — hosts see this when you apply.";

const EMPTY_RESUME: SeekerResume = {
	profile: null,
	experiences: [],
	educations: [],
	certifications: [],
};

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

	const hasDataConfig = Boolean(
		process.env.NEXT_PUBLIC_SUPABASE_URL &&
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
	);
	if (!hasDataConfig && process.env.NODE_ENV === "production") {
		throw new Error("Resume requires the configured Supabase environment.");
	}

	// The local review bench intentionally runs without credentials. Keep the
	// full resume builder available there so the workflow can be reviewed and
	// visually tested; production still fails loudly when its data contract is
	// misconfigured.
	const resume = hasDataConfig
		? await getSeekerResume(token, userId)
		: EMPTY_RESUME;
	const completion = computeResumeCompletion(resume);

	return (
		<BucketPage title="Resume" description={RESUME_DESCRIPTION}>
			<ResumeBuilder resume={resume} completion={completion} />
		</BucketPage>
	);
}
