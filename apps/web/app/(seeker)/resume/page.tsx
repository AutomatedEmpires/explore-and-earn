import type { Metadata } from "next";

import { BucketPage, ResumePanel, RESUME_PROGRESS } from "../../../components/seeker";

export const metadata: Metadata = {
	title: "Resume",
};

export default function ResumePage() {
	return (
		<BucketPage
			title="Resume"
			description="Your visual, tag-based compatibility profile."
		>
			<ResumePanel progress={RESUME_PROGRESS} />
		</BucketPage>
	);
}
