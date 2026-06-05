import type { Metadata } from "next";

import { auth } from "@clerk/nextjs/server";
import { getSeekerResume, type SeekerResume } from "@explore-and-earn/db";

import {
	BucketPage,
	ResumeData,
	ResumePanel,
	RESUME_PROGRESS,
} from "../../../components/seeker";

export const metadata: Metadata = {
	title: "Resume",
};

// Reads per-request Clerk auth; never statically cache.
export const dynamic = "force-dynamic";

const EMPTY_RESUME: SeekerResume = { experiences: [], certifications: [] };

async function loadResume(): Promise<SeekerResume> {
	const { userId, getToken } = await auth();
	if (!userId) {
		return EMPTY_RESUME;
	}
	const token = await getToken();
	if (!token) {
		return EMPTY_RESUME;
	}
	return getSeekerResume(token);
}

/**
 * Resume — founder-locked seeker-nav tab. The founder-locked ResumePanel
 * readiness gauge is preserved as-is; live experience + certification detail
 * (ResumeData) is appended below it, scoped to the signed-in seeker.
 *
 * Do-not-deploy until RLS (A-RLS-001) is active (see profile page note).
 */
export default async function ResumePage() {
	const resume = await loadResume();

	return (
		<BucketPage
			title="Resume"
			description="Your visual, tag-based compatibility profile."
		>
			<ResumePanel progress={RESUME_PROGRESS} />
			<ResumeData resume={resume} />
		</BucketPage>
	);
}
