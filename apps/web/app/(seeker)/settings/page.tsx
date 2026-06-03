import { BucketPage, SettingsPanel, SETTINGS_GROUPS } from "../../../components/seeker";

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
