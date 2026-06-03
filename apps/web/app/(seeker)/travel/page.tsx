import {
	BucketPage,
	TRAVEL_PLANS,
	TravelPanel,
} from "../../../components/seeker";

export default function TravelPage() {
	return (
		<BucketPage
			title="Travel plans"
			description="Plan your trip for accepted roles and review host travel notes."
		>
			<TravelPanel plans={TRAVEL_PLANS} />
		</BucketPage>
	);
}
