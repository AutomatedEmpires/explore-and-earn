import type { Metadata } from "next";

import {
	BucketPage,
	SCHEDULE_PROPOSALS,
	SchedulePanel,
} from "../../../components/seeker";

export const metadata: Metadata = {
	title: "Schedule",
};

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
