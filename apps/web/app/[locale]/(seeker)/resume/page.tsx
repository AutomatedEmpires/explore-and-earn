import type { Metadata } from "next";
import Link from "next/link";

import { auth } from "@clerk/nextjs/server";
import { getSeekerResume, type SeekerResume } from "@explore-and-earn/db";
import { Icon } from "@explore-and-earn/ui";

import { isDevBenchEnabled } from "../../../../lib/devBench";
import { devFallback } from "../../../../lib/devBench/fallback";
import { readDevRole } from "../../../../lib/devBench/server";
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

/**
 * The local review bench must not inherit whatever happens to be in a running
 * developer database. An empty résumé exercises the real builder's honest
 * first-use state without inventing saved progress or touching a provider.
 */
const DEV_BENCH_RESUME: SeekerResume = {
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

/**
 * Only ever follow an INTERNAL path back. A redirect_url is attacker-supplyable
 * via a crafted link, so anything protocol-relative or absolute is discarded
 * rather than turned into an off-site hop the seeker did not ask for.
 */
function safeReturnPath(raw: string | string[] | undefined): string | null {
	const value = Array.isArray(raw) ? raw[0] : raw;
	if (typeof value !== "string") return null;
	if (!value.startsWith("/") || value.startsWith("//")) return null;
	return value;
}

interface ResumePageProps {
	readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface ResumeContentProps {
	readonly resume: SeekerResume;
	readonly returnTo: string | null;
}

function ResumeContent({ resume, returnTo }: ResumeContentProps) {
	return (
		<BucketPage title="Resume" description={RESUME_DESCRIPTION}>
			{returnTo ? (
				<Link className="ui-button ui-button--ghost" href={returnTo}>
					<Icon name="action.back" size={16} aria-hidden />
					Back to the opportunity
				</Link>
			) : null}
			<ResumeBuilder resume={resume} completion={computeResumeCompletion(resume)} />
		</BucketPage>
	);
}

export default async function ResumePage({ searchParams }: ResumePageProps) {
	const returnTo = safeReturnPath((await searchParams).redirect_url);

	// Dev-only deterministic seam. This branch is structurally unavailable in a
	// production build and short-circuits before Clerk or Supabase is consulted.
	if (isDevBenchEnabled() && (await readDevRole()) === "seeker") {
		return <ResumeContent resume={DEV_BENCH_RESUME} returnTo={returnTo} />;
	}

	const { userId, getToken } = await auth();

	if (!userId) {
		return <SignedOutResume />;
	}

	const token = await getToken();
	if (!token) {
		return <SignedOutResume />;
	}

	const resume = await devFallback(getSeekerResume(token, userId), {
		profile: null,
		experiences: [],
		educations: [],
		certifications: [],
	});
	return <ResumeContent resume={resume} returnTo={returnTo} />;
}
