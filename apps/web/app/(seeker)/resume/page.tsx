import { BucketPage, ResumePanel, RESUME_PROGRESS } from "../../../components/seeker";

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
