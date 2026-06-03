import { BucketPage } from "../../../components/seeker";
import { EmptyState } from "../../../components/discovery";

/**
 * Seek — locked seeker-nav tab (the founder-flagged route). Placeholder surface
 * until the Phase D opportunity feed lands; ships now so the locked bottom nav
 * has no dead tab.
 */
export default function SeekPage() {
	return (
		<BucketPage
			title="Seek"
			description="Browse and search every open opportunity."
		>
			<EmptyState
				title="Seek is coming soon"
				message="The full opportunity feed is in active development. Check back shortly."
			/>
		</BucketPage>
	);
}
