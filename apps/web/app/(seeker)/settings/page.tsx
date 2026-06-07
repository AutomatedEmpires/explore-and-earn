import type { Metadata } from "next";

import { BucketPage, NotificationPrefsForm } from "../../../components/seeker";
import { getNotificationPrefsAction } from "../../actions/notificationPrefs";

export const metadata: Metadata = {
	title: "Settings",
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
	const prefs = await getNotificationPrefsAction();

	return (
		<BucketPage
			title="Settings"
			description="Account, privacy, and notification preferences."
		>
			<NotificationPrefsForm initialPrefs={prefs} />
		</BucketPage>
	);
}
