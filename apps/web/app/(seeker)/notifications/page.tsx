import type { Metadata } from "next";

import { BucketPage, NotificationList, NOTIFICATIONS } from "../../../components/seeker";

export const metadata: Metadata = {
	title: "Notifications",
};

export default function NotificationsPage() {
	return (
		<BucketPage
			title="Notifications"
			description="Invites, offers, matches, and reminders."
		>
			<NotificationList items={NOTIFICATIONS} />
		</BucketPage>
	);
}
