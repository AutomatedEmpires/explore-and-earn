import { BucketPage, ProfileHub, SEEKER_STATUS } from "../../../components/seeker";

/**
 * Profile — founder-locked seeker-nav tab. The unified profile hub: identity,
 * pipeline snapshot, resume readiness, and links to every seeker surface.
 */
export default function ProfilePage() {
	return (
		<BucketPage
			title="Profile"
			description="Your seeker profile, resume, and account settings."
		>
			<ProfileHub status={SEEKER_STATUS} />
		</BucketPage>
	);
}
