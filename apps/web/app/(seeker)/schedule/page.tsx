import {
	BucketPage,
	SCHEDULE_PROPOSALS,
	SchedulePanel,
} from "../../../components/seeker";

export default function SchedulePage() {
	return (
		<BucketPage
			title="Schedule"
			description="Interview, call, and trial-day times proposed with hosts."
		>
			<SchedulePanel proposals={SCHEDULE_PROPOSALS} />
		</BucketPage>
	);
}
