import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";

import {
	AppearanceControl,
	NotificationPrefsForm,
	SectionHeading,
	SeekerPage,
	SettingsAssurances,
	SettingsPanel,
	SETTINGS_ASSURANCES,
	buildAccountGroups,
} from "../../../../components/seeker";
import { getClerkContact } from "../../../../lib/clerkUser";
import { getNotificationPrefsAction } from "../../../actions/notificationPrefs";
import styles from "./settings.module.css";

export const metadata: Metadata = {
	title: "Settings",
};

export const dynamic = "force-dynamic";

async function resolveEmail(): Promise<string | null> {
	try {
		const { userId } = await auth();
		if (!userId) return null;
		const { email } = await getClerkContact(userId);
		return email;
	} catch {
		return null;
	}
}

export default async function SettingsPage() {
	const [prefs, email] = await Promise.all([
		getNotificationPrefsAction(),
		resolveEmail(),
	]);
	const groups = buildAccountGroups(email);

	return (
		<SeekerPage
			title="Settings"
			description="Manage your notifications, privacy, and account — and see what to expect from Explore&Earn."
		>
			<div className={styles.stack}>
				<section className={styles.section}>
					<SectionHeading
						title="Notifications"
						description="Choose which emails you get. Changes save the moment you toggle them."
					/>
					<NotificationPrefsForm initialPrefs={prefs} />
				</section>

				<section className={styles.section}>
					<SectionHeading
						title="Appearance"
						description="Choose Light, Dark, or Auto. Auto follows the time of day and your device."
					/>
					<AppearanceControl />
				</section>

				<section className={styles.section}>
					<SectionHeading
						title="Account & privacy"
						description="Your details and who can see them."
					/>
					<SettingsPanel groups={groups} />
				</section>

				<section className={styles.section}>
					<SectionHeading title="What to expect" />
					<SettingsAssurances assurances={SETTINGS_ASSURANCES} />
				</section>
			</div>
		</SeekerPage>
	);
}
