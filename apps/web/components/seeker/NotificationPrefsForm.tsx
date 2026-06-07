"use client";

import { useState, useTransition } from "react";
import type { NotificationPrefs } from "@explore-and-earn/db";

import { saveNotificationPrefsAction } from "../../app/actions/notificationPrefs";
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
		label: "Invites and offers",
		description: "Email me when a host invites me or sends an offer.",
	},
	{
		key: "emailOnStatusChange",
		label: "Application updates",
		description: "Email me when one of my applications changes status.",
	},
	{
		key: "emailOnMessage",
		label: "New messages",
		description: "Email me when I receive a new message.",
	},
];

/**
 * Seeker notification-preference toggles. Each switch saves immediately via the
 * server action; on failure the optimistic flip is reverted and an inline error
 * is shown.
 */
export function NotificationPrefsForm({
	initialPrefs,
}: NotificationPrefsFormProps) {
	const [prefs, setPrefs] = useState<NotificationPrefs>(initialPrefs);
	const [error, setError] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);
	const [isPending, startTransition] = useTransition();

	function toggle(key: PrefKey) {
		const previous = prefs;
		const next: NotificationPrefs = { ...prefs, [key]: !prefs[key] };
		setPrefs(next);
		setError(null);
		setSaved(false);
		startTransition(async () => {
			const result = await saveNotificationPrefsAction(next);
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
							<span className={styles.text}>
								<span className={styles.label}>{item.label}</span>
								<span className={styles.description}>{item.description}</span>
							</span>
							<button
								type="button"
							role="switch"
							aria-checked={checked}
							aria-label={item.label}
							className={
								checked ? `${styles.switch} ${styles.on}` : styles.switch
							}
							disabled={isPending}
							onClick={() => toggle(item.key)}
						>
							<span className={styles.knob} aria-hidden />
						</button>
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
