"use client";

import { useState, useTransition } from "react";
import type { NotificationPrefs, NotificationPrefsPatch } from "@explore-and-earn/db/client";

import { updateNotificationPrefsAction } from "../../app/actions/notificationPrefs";
import styles from "./NotificationPrefsForm.module.css";

export interface NotificationPrefsFormProps {
	/** Server-resolved current preferences. */
	readonly initialPrefs: NotificationPrefs;
}

type PrefKey = keyof NotificationPrefs;

interface ToggleConfig {
	readonly key: PrefKey;
	readonly label: string;
	readonly description: string;
}

const TOGGLES: readonly ToggleConfig[] = [
	{
		key: "emailOnInvite",
		label: "Email me when I receive an invite",
		description: "Host invites and offer-related updates can be sent by email.",
	},
	{
		key: "emailOnStatusChange",
		label: "Email me when my application status changes",
		description: "Get emailed when an application moves through the hiring flow.",
	},
	{
		key: "emailOnMessage",
		label: "Email me when I receive a message",
		description: "Stay in the loop when a host sends a message.",
	},
];

/**
 * Seeker notification-preference checkboxes. Each toggle saves immediately via
 * the server action; on failure the optimistic flip is reverted and an inline
 * error is shown.
 */
export function NotificationPrefsForm({
	initialPrefs,
}: NotificationPrefsFormProps) {
	const [prefs, setPrefs] = useState<NotificationPrefs>(initialPrefs);
	const [error, setError] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);
	const [isPending, startTransition] = useTransition();

	function toggle(key: PrefKey, checked: boolean) {
		const previous = prefs;
		const next: NotificationPrefs = { ...prefs, [key]: checked };
		const patch = { [key]: checked } as NotificationPrefsPatch;
		setPrefs(next);
		setError(null);
		setSaved(false);
		startTransition(async () => {
			const result = await updateNotificationPrefsAction(patch);
			if (result.ok) {
				setSaved(true);
			} else {
				setPrefs(previous);
				setError("Couldn't save your preferences. Please try again.");
			}
		});
	}

	return (
		<section className={styles.group} aria-label="Notification preferences">
			<h2 className={styles.groupTitle}>Notification preferences</h2>
			<ul className={styles.rows}>
				{TOGGLES.map((item) => {
					const checked = prefs[item.key];
					return (
						<li key={item.key} className={styles.row}>
							<label className={styles.checkboxRow}>
								<input
									type="checkbox"
									className={styles.checkbox}
									checked={checked}
									disabled={isPending}
									onChange={(event) => toggle(item.key, event.currentTarget.checked)}
								/>
								<span className={styles.text}>
									<span className={styles.label}>{item.label}</span>
									<span className={styles.description}>{item.description}</span>
								</span>
							</label>
						</li>
					);
				})}
			</ul>
			<p className={styles.status} role="status" aria-live="polite">
				{error ? error : saved ? "Preferences saved." : "\u00A0"}
			</p>
		</section>
	);
}
