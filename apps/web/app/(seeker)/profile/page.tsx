import { BucketPage } from "../../../components/seeker";
import { EmptyState } from "../../../components/discovery";

/**
 * Profile — locked seeker-nav tab. Placeholder surface until the Phase D unified
 * profile hub lands; ships now so the founder-locked bottom nav has no dead tab.
 * Resume editing currently lives at the Resume & profile surface (/resume).
 */
export default function ProfilePage() {
	return (
		<BucketPage
			title="Profile"
			description="Your seeker profile, resume, and account settings."
		>
			<EmptyState
				title="Profile hub is coming soon"
				message="A unified profile hub is in active development. For now, manage your resume from Resume & profile."
			/>
		</BucketPage>
	);
}
