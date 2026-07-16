"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import {
	ENGAGEMENT_CATEGORIES,
	type EngagementCategory,
	type NotificationCadence,
	type ResolvedNotificationPrefs,
} from "@explore-and-earn/contracts";

import {
	updateEngineCategoryPrefAction,
	updateEngineMasterSwitchesAction,
	updateQuietHoursAction,
	type EngineSettingsView,
} from "../../app/actions/notificationEngine";
import {
	getVapidPublicKeyAction,
	removePushSubscriptionAction,
	savePushSubscriptionAction,
} from "../../app/actions/pushSubscriptions";
import styles from "./EngagementNotificationSettings.module.css";

export interface EngagementNotificationSettingsProps {
	readonly initial: EngineSettingsView;
}

type PushDeviceState =
	| "unknown"
	| "unsupported"
	| "not_configured"
	| "denied"
	| "subscribed"
	| "unsubscribed";

const EMAIL_CADENCES: readonly NotificationCadence[] = [
	"immediate",
	"daily",
	"weekly",
	"off",
];

function minutesToTime(minute: number | null): string {
	const m = minute ?? 0;
	return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function timeToMinutes(value: string): number {
	const [h, m] = value.split(":").map(Number);
	return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function base64UrlToUint8Array(base64Url: string): Uint8Array {
	const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
	const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
	const raw = atob(base64);
	const output = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
	return output;
}

/**
 * Notification-engine preference controls: per-channel master switches,
 * per-category cadences, quiet hours, and the push device toggle. The
 * browser's notification-permission prompt is requested ONLY from the
 * explicit device toggle click — never on page load.
 */
export function EngagementNotificationSettings({
	initial,
}: EngagementNotificationSettingsProps) {
	const t = useTranslations("Notifications.settings");
	const [prefs, setPrefs] = useState<ResolvedNotificationPrefs>(initial.prefs);
	const [statusKey, setStatusKey] = useState<"saved" | "error" | null>(null);
	const [isPending, startTransition] = useTransition();
	const [pushDevice, setPushDevice] = useState<PushDeviceState>("unknown");
	const [pushBusy, setPushBusy] = useState(false);

	// Passive capability probe (no permission request, no subscribe call).
	useEffect(() => {
		let cancelled = false;
		(async () => {
			if (
				typeof window === "undefined" ||
				!("serviceWorker" in navigator) ||
				!("PushManager" in window) ||
				!("Notification" in window)
			) {
				if (!cancelled) setPushDevice("unsupported");
				return;
			}
			if (Notification.permission === "denied") {
				if (!cancelled) setPushDevice("denied");
				return;
			}
			try {
				// serviceWorker.ready never settles when no SW is registered
				// (dev builds don't register one) — race a timeout so the probe
				// resolves to an explained state instead of hanging silently.
				const registration = await Promise.race([
					navigator.serviceWorker.ready,
					new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
				]);
				if (!registration) {
					if (!cancelled) setPushDevice("not_configured");
					return;
				}
				const existing = await registration.pushManager.getSubscription();
				if (!cancelled) setPushDevice(existing ? "subscribed" : "unsubscribed");
			} catch {
				if (!cancelled) setPushDevice("unsubscribed");
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const runSave = useCallback(
		(previous: ResolvedNotificationPrefs, save: () => Promise<{ ok: boolean }>) => {
			setStatusKey(null);
			startTransition(async () => {
				const result = await save();
				if (result.ok) {
					setStatusKey("saved");
				} else {
					setPrefs(previous);
					setStatusKey("error");
				}
			});
		},
		[],
	);

	function setMaster(channel: "email" | "push" | "inApp", enabled: boolean) {
		const previous = prefs;
		setPrefs({
			...prefs,
			emailEnabled: channel === "email" ? enabled : prefs.emailEnabled,
			pushEnabled: channel === "push" ? enabled : prefs.pushEnabled,
			inAppEnabled: channel === "inApp" ? enabled : prefs.inAppEnabled,
		});
		runSave(previous, () =>
			updateEngineMasterSwitchesAction({
				...(channel === "email" ? { emailEnabled: enabled } : {}),
				...(channel === "push" ? { pushEnabled: enabled } : {}),
				...(channel === "inApp" ? { inAppEnabled: enabled } : {}),
			}),
		);
	}

	function setCategory(
		category: EngagementCategory,
		patch: { email?: NotificationCadence; push?: "immediate" | "off"; inApp?: "on" | "off" },
	) {
		const previous = prefs;
		const current = prefs.categories[category];
		setPrefs({
			...prefs,
			categories: {
				...prefs.categories,
				[category]: {
					email: patch.email ?? current.email,
					push: patch.push ?? current.push,
					inApp: patch.inApp ?? current.inApp,
				},
			},
		});
		runSave(previous, () => updateEngineCategoryPrefAction(category, patch));
	}

	function setQuietHours(next: {
		enabled: boolean;
		startMinute?: number;
		endMinute?: number;
	}) {
		const previous = prefs;
		const timezone =
			prefs.quietHours.timezone ??
			Intl.DateTimeFormat().resolvedOptions().timeZone ??
			"UTC";
		const startMinute = next.startMinute ?? prefs.quietHours.startMinute ?? 22 * 60;
		const endMinute = next.endMinute ?? prefs.quietHours.endMinute ?? 7 * 60;
		setPrefs({
			...prefs,
			quietHours: { enabled: next.enabled, startMinute, endMinute, timezone },
		});
		runSave(previous, () =>
			updateQuietHoursAction(
				next.enabled
					? { enabled: true, startMinute, endMinute, timezone }
					: { enabled: false },
			),
		);
	}

	async function enablePushOnDevice() {
		// Permission is requested HERE, on the explicit user gesture.
		setPushBusy(true);
		setStatusKey(null);
		try {
			const { key } = await getVapidPublicKeyAction();
			if (!key) {
				setPushDevice("not_configured");
				return;
			}
			const permission = await Notification.requestPermission();
			if (permission !== "granted") {
				setPushDevice(permission === "denied" ? "denied" : "unsubscribed");
				return;
			}
			const registration = await navigator.serviceWorker.ready;
			const subscription =
				(await registration.pushManager.getSubscription()) ??
				(await registration.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey: base64UrlToUint8Array(key) as BufferSource,
				}));
			const json = subscription.toJSON();
			if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
				setStatusKey("error");
				return;
			}
			const result = await savePushSubscriptionAction({
				endpoint: json.endpoint,
				keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
				userAgent: navigator.userAgent,
				timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				locale: navigator.language,
			});
			if (result.ok) {
				setPushDevice("subscribed");
				setPrefs((current) => ({ ...current, pushEnabled: true }));
				setStatusKey("saved");
			} else {
				setStatusKey("error");
			}
		} catch {
			setStatusKey("error");
		} finally {
			setPushBusy(false);
		}
	}

	async function disablePushOnDevice() {
		setPushBusy(true);
		setStatusKey(null);
		try {
			const registration = await navigator.serviceWorker.ready;
			const subscription = await registration.pushManager.getSubscription();
			if (subscription) {
				const endpoint = subscription.endpoint;
				await subscription.unsubscribe();
				await removePushSubscriptionAction(endpoint);
			}
			setPushDevice("unsubscribed");
			setStatusKey("saved");
		} catch {
			setStatusKey("error");
		} finally {
			setPushBusy(false);
		}
	}

	const quiet = prefs.quietHours;
	const timezoneLabel =
		quiet.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";

	return (
		<section className={styles.group} aria-label={t("heading")}>
			<div className={styles.block}>
				<ul className={styles.rows}>
					{(
						[
							{ channel: "email" as const, enabled: prefs.emailEnabled },
							{ channel: "push" as const, enabled: prefs.pushEnabled },
							{ channel: "inApp" as const, enabled: prefs.inAppEnabled },
						]
					).map(({ channel, enabled }) => (
						<li key={channel} className={styles.row}>
							<div className={styles.rowHead}>
								<span className={styles.text}>
									<span className={styles.label}>{t(`master.${channel}.label`)}</span>
									<span className={styles.description}>
										{t(`master.${channel}.description`)}
									</span>
								</span>
								<input
									type="checkbox"
									className={styles.checkbox}
									checked={enabled}
									disabled={isPending || pushBusy}
									onChange={(event) => setMaster(channel, event.currentTarget.checked)}
									aria-label={t(`master.${channel}.label`)}
								/>
							</div>
							{channel === "push" ? (
								<div>
									{pushDevice === "unsupported" ? (
										<p className={styles.description}>{t("pushDevice.unsupported")}</p>
									) : pushDevice === "denied" ? (
										<p className={styles.description}>{t("pushDevice.denied")}</p>
									) : pushDevice === "not_configured" ? (
										<p className={styles.description}>{t("pushDevice.notConfigured")}</p>
									) : pushDevice === "subscribed" ? (
										<>
											<p className={styles.description}>{t("pushDevice.enabled")}</p>
											<button
												type="button"
												className={styles.pushButton}
												disabled={pushBusy || isPending}
												onClick={disablePushOnDevice}
											>
												{t("pushDevice.disable")}
											</button>
										</>
									) : (
										<button
											type="button"
											className={styles.pushButton}
											disabled={pushBusy || isPending || pushDevice === "unknown"}
											onClick={enablePushOnDevice}
										>
											{t("pushDevice.enable")}
										</button>
									)}
								</div>
							) : null}
						</li>
					))}
				</ul>
			</div>

			<div className={styles.block}>
				<h3 className={styles.blockTitle}>{t("categoriesHeading")}</h3>
				<ul className={styles.rows}>
					{ENGAGEMENT_CATEGORIES.map((category) => {
						const value = prefs.categories[category];
						return (
							<li key={category} className={styles.row}>
								<div className={styles.rowHead}>
									<span className={styles.text}>
										<span className={styles.label}>
											{t(`categories.${category}.label`)}
										</span>
										<span className={styles.description}>
											{t(`categories.${category}.description`)}
										</span>
									</span>
								</div>
								<div className={styles.channelGrid}>
									<label className={styles.channelField}>
										<span className={styles.channelLabel}>{t("emailColumn")}</span>
										<select
											className={styles.select}
											value={value.email}
											disabled={isPending || pushBusy || !prefs.emailEnabled}
											onChange={(event) =>
												setCategory(category, {
													email: event.currentTarget.value as NotificationCadence,
												})
											}
										>
											{EMAIL_CADENCES.map((cadence) => (
												<option key={cadence} value={cadence}>
													{t(`cadence.${cadence}`)}
												</option>
											))}
										</select>
									</label>
									<label className={styles.channelField}>
										<span className={styles.channelLabel}>{t("pushColumn")}</span>
										<select
											className={styles.select}
											value={value.push}
											disabled={isPending || pushBusy || !prefs.pushEnabled}
											onChange={(event) =>
												setCategory(category, {
													push: event.currentTarget.value as "immediate" | "off",
												})
											}
										>
											<option value="immediate">{t("toggle.on")}</option>
											<option value="off">{t("toggle.off")}</option>
										</select>
									</label>
									<label className={styles.channelField}>
										<span className={styles.channelLabel}>{t("inAppColumn")}</span>
										<select
											className={styles.select}
											value={value.inApp}
											disabled={isPending || pushBusy || !prefs.inAppEnabled}
											onChange={(event) =>
												setCategory(category, {
													inApp: event.currentTarget.value as "on" | "off",
												})
											}
										>
											<option value="on">{t("toggle.on")}</option>
											<option value="off">{t("toggle.off")}</option>
										</select>
									</label>
								</div>
							</li>
						);
					})}
				</ul>
			</div>

			<div className={styles.block}>
				<ul className={styles.rows}>
					<li className={styles.row}>
						<div className={styles.rowHead}>
							<span className={styles.text}>
								<span className={styles.label}>{t("quiet.label")}</span>
								<span className={styles.description}>{t("quiet.description")}</span>
							</span>
							<input
								type="checkbox"
								className={styles.checkbox}
								checked={quiet.enabled}
								disabled={isPending || pushBusy}
								onChange={(event) => setQuietHours({ enabled: event.currentTarget.checked })}
								aria-label={t("quiet.label")}
							/>
						</div>
						{quiet.enabled ? (
							<div className={styles.quietGrid}>
								<label className={styles.channelField}>
									<span className={styles.channelLabel}>{t("quiet.start")}</span>
									<input
										type="time"
										className={styles.timeInput}
										value={minutesToTime(quiet.startMinute)}
										disabled={isPending || pushBusy}
										onChange={(event) =>
											setQuietHours({
												enabled: true,
												startMinute: timeToMinutes(event.currentTarget.value),
											})
										}
									/>
								</label>
								<label className={styles.channelField}>
									<span className={styles.channelLabel}>{t("quiet.end")}</span>
									<input
										type="time"
										className={styles.timeInput}
										value={minutesToTime(quiet.endMinute)}
										disabled={isPending || pushBusy}
										onChange={(event) =>
											setQuietHours({
												enabled: true,
												endMinute: timeToMinutes(event.currentTarget.value),
											})
										}
									/>
								</label>
								<span className={styles.description}>
									{t("quiet.timezoneNote", { timezone: timezoneLabel })}
								</span>
							</div>
						) : null}
					</li>
				</ul>
			</div>

			<p className={styles.status} role="status" aria-live="polite">
				{statusKey ? t(`status.${statusKey}`) : " "}
			</p>
		</section>
	);
}
