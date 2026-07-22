import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { getTranslations } from "next-intl/server";

import {
	AppearanceControl,
	EngagementNotificationSettings,
	PaletteControl,
	SectionHeading,
	SeekerPage,
	SettingsAssurances,
	SettingsPanel,
	SETTINGS_ASSURANCES,
	buildAccountGroups,
} from "../../../../components/seeker";
import { getClerkContact } from "../../../../lib/clerkUser";
import { getEngineNotificationSettingsAction } from "../../../actions/notificationEngine";
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
	const [engineSettings, email, t] = await Promise.all([
		getEngineNotificationSettingsAction(),
		resolveEmail(),
		getTranslations("Notifications.settings"),
	]);
	const groups = buildAccountGroups(email);

	return (
		<SeekerPage
			title="Settings"
			description="Manage your notifications, privacy, and account — and see what to expect from Explore&Earn."
		>
			<div className={styles.stack}>
				<section className={styles.section}>
					<SectionHeading title={t("heading")} description={t("description")} />
					<EngagementNotificationSettings initial={engineSettings} />
				</section>

				<section className={styles.section}>
					<SectionHeading
						title="Appearance"
						description="Light by default — switch to Dark, or System to follow your device, and pick an accent palette to recolor the app."
					/>
					<AppearanceControl />
					<PaletteControl />
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
