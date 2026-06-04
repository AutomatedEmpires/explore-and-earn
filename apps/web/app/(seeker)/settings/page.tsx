import type { Metadata } from "next";

import { BucketPage, SettingsPanel, SETTINGS_GROUPS } from "../../../components/seeker";

export const metadata: Metadata = {
	title: "Settings",
};

export default function SettingsPage() {
	return (
		<BucketPage
			title="Settings"
			description="Account, privacy, and notification preferences."
		>
			<SettingsPanel groups={SETTINGS_GROUPS} />
		</BucketPage>
	);
}
