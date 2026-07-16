import { HostDetailSkeleton } from "../../../../../components/host";
import { BucketPage } from "../../../../../components/seeker";

/**
 * Loading placeholder for the seeker message thread. Shown during async
 * navigation so the transition never flashes a blank screen.
 */
export default function Loading() {
	return (
		<BucketPage title="Conversation">
			<HostDetailSkeleton />
		</BucketPage>
	);
}
