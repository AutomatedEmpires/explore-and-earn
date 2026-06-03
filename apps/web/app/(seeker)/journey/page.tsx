import {
	BucketPage,
	JOURNEY_STOPS,
	JourneyTimeline,
} from "../../../components/seeker";

export default function JourneyPage() {
	return (
		<BucketPage
			title="Journey map"
			description="Where you've been and where you're headed."
		>
			<JourneyTimeline stops={JOURNEY_STOPS} />
		</BucketPage>
	);
}
