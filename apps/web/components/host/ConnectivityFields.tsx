"use client";

import { useState } from "react";

import {
	CONNECTION_TYPES,
	CONNECTIVITY_ACCESS,
	CONNECTIVITY_COST,
	CONNECTIVITY_RELIABILITY,
	NOT_STATED_LABEL,
	type ConnectionType,
	type ConnectivityAccess,
	type ConnectivityCost,
	type ConnectivityInfo,
	type ConnectivityReliability,
} from "@explore-and-earn/contracts";

// Reuses the listing form's own field styling — this IS part of that form, and
// borrowing its classes keeps the connectivity group visually identical to
// every other field without a second stylesheet to drift.
import styles from "./ListingForm.module.css";

/**
 * Connectivity — the host's answer to "can I actually get online here?".
 *
 * THE HONESTY RULE THIS UI ENFORCES: every control defaults to "Not stated"
 * and nothing is pre-filled. A pre-checked "Wi-Fi: yes" would manufacture a
 * claim the host never made — exactly the "Wi-Fi available" promise the
 * product must never imply. Leaving a field alone is a first-class outcome:
 * it stores no key, and the listing honestly reads "Not stated".
 *
 * "No internet here" (available = No) is a REAL answer worth giving — for a
 * remote-work seeker it is decisive — so it is offered as plainly as "Yes",
 * and choosing it collapses the descriptive fields (a listing can never say
 * "no internet" and "50 Mbps" at once; the contract drops them anyway).
 */

const CONNECTION_TYPE_LABEL: Record<ConnectionType, string> = {
	fiber: "Fiber",
	cable: "Cable",
	dsl: "DSL",
	fixed_wireless: "Fixed wireless",
	satellite: "Satellite (e.g. Starlink)",
	cellular: "Cellular / hotspot",
};

const COST_LABEL: Record<ConnectivityCost, string> = {
	included: "Included — no extra cost",
	paid_separately: "Paid separately by the worker",
};

const ACCESS_LABEL: Record<ConnectivityAccess, string> = {
	private: "Private to the worker",
	shared: "Shared with others",
};

const RELIABILITY_LABEL: Record<ConnectivityReliability, string> = {
	reliable: "Usually reliable",
	intermittent: "Drops sometimes (weather, load)",
	unreliable: "Often unreliable",
};

/** The select value meaning "the host has not answered" — never persisted. */
const UNSET = "";

/** Seed a speed input from a stored number; unstated shows an empty box. */
function speedText(stored: number | undefined): string {
	return stored === undefined ? "" : String(stored);
}

export interface ConnectivityFieldsProps {
	readonly value: ConnectivityInfo;
	readonly onChange: (next: ConnectivityInfo) => void;
}

export function ConnectivityFields({ value, onChange }: ConnectivityFieldsProps) {
	/**
	 * The speed inputs keep their own text while the host types.
	 *
	 * Only a positive number is ever a stated speed, so "0" alone stores
	 * nothing — but it is also the first keystroke of "0.5", and a rendered
	 * value fed back from the stored number would erase it before the "." was
	 * typed. Sub-1 Mbps upload is the real case here (satellite, a vessel, a
	 * hilltop barn), so it has to be typeable. The text is what the host sees;
	 * the parent still only ever receives a valid number or nothing at all.
	 */
	const [downloadText, setDownloadText] = useState(() => speedText(value.downloadMbps));
	const [uploadText, setUploadText] = useState(() => speedText(value.uploadMbps));

	/** Set one key, or REMOVE it entirely when the host clears the control. */
	function patch<K extends keyof ConnectivityInfo>(
		key: K,
		next: ConnectivityInfo[K] | undefined,
	) {
		const draft: Record<string, unknown> = { ...value };
		if (next === undefined) delete draft[key];
		else draft[key] = next;
		onChange(draft as ConnectivityInfo);
	}

	function setAvailable(raw: string) {
		if (raw === UNSET) {
			// Back to unanswered: drop the whole group rather than leave orphaned
			// details describing a connection the host no longer claims exists.
			onChange({});
			return;
		}
		const available = raw === "yes";
		if (!available) {
			// "No internet" — the descriptive fields are incoherent now.
			onChange({ available: false });
			return;
		}
		patch("available", true);
	}

	function toggleLocation(location: "housing" | "worksite", checked: boolean) {
		const current = new Set(value.locations ?? []);
		if (checked) current.add(location);
		else current.delete(location);
		const next = [...current];
		patch("locations", next.length > 0 ? next : undefined);
	}

	/** Number input → value, or undefined when cleared/invalid (= not stated). */
	function numberOrUnset(raw: string): number | undefined {
		if (raw.trim() === "") return undefined;
		const parsed = Number(raw);
		return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
	}

	const availableValue =
		value.available === undefined ? UNSET : value.available ? "yes" : "no";
	const describesConnection = value.available === true;

	return (
		<div className={styles.field}>
			<div className={styles.labelRow}>
				<span className={styles.label} id="connectivity-label">
					Internet
				</span>
			</div>
			<p className={styles.hint}>
				Only answer what you know. Anything you leave alone shows as
				&ldquo;{NOT_STATED_LABEL}&rdquo; — never as a promise.
			</p>

			<div className={styles.field}>
				<div className={styles.labelRow}>
					<label className={styles.label} htmlFor="connectivity-available">
						Is there internet?
					</label>
				</div>
				<select
					className={styles.input}
					id="connectivity-available"
					value={availableValue}
					onChange={(event) => setAvailable(event.target.value)}
				>
					<option value={UNSET}>{NOT_STATED_LABEL}</option>
					<option value="yes">Yes</option>
					<option value="no">No — there is no internet here</option>
				</select>
			</div>

			{describesConnection ? (
				<>
					<div className={styles.row}>
						<div className={styles.field}>
							<div className={styles.labelRow}>
								<label className={styles.label} htmlFor="connectivity-cost">
									Cost
								</label>
							</div>
							<select
								className={styles.input}
								id="connectivity-cost"
								value={value.cost ?? UNSET}
								onChange={(event) =>
									patch(
										"cost",
										event.target.value === UNSET
											? undefined
											: (event.target.value as ConnectivityCost),
									)
								}
							>
								<option value={UNSET}>{NOT_STATED_LABEL}</option>
								{CONNECTIVITY_COST.map((option) => (
									<option key={option} value={option}>
										{COST_LABEL[option]}
									</option>
								))}
							</select>
						</div>

						<div className={styles.field}>
							<div className={styles.labelRow}>
								<label className={styles.label} htmlFor="connectivity-type">
									Connection type
								</label>
							</div>
							<select
								className={styles.input}
								id="connectivity-type"
								value={value.connectionType ?? UNSET}
								onChange={(event) =>
									patch(
										"connectionType",
										event.target.value === UNSET
											? undefined
											: (event.target.value as ConnectionType),
									)
								}
							>
								<option value={UNSET}>{NOT_STATED_LABEL}</option>
								{CONNECTION_TYPES.map((option) => (
									<option key={option} value={option}>
										{CONNECTION_TYPE_LABEL[option]}
									</option>
								))}
							</select>
						</div>
					</div>

					<fieldset className={styles.field}>
						<legend className={styles.label}>Where it works</legend>
						{(["housing", "worksite"] as const).map((location) => (
							<label key={location} className={styles.hint} htmlFor={`connectivity-at-${location}`}>
								<input
									id={`connectivity-at-${location}`}
									type="checkbox"
									checked={(value.locations ?? []).includes(location)}
									onChange={(event) => toggleLocation(location, event.target.checked)}
								/>{" "}
								{location === "housing" ? "In housing" : "At the worksite"}
							</label>
						))}
					</fieldset>

					<div className={styles.row}>
						<div className={styles.field}>
							<div className={styles.labelRow}>
								<label className={styles.label} htmlFor="connectivity-access">
									Shared or private
								</label>
							</div>
							<select
								className={styles.input}
								id="connectivity-access"
								value={value.access ?? UNSET}
								onChange={(event) =>
									patch(
										"access",
										event.target.value === UNSET
											? undefined
											: (event.target.value as ConnectivityAccess),
									)
								}
							>
								<option value={UNSET}>{NOT_STATED_LABEL}</option>
								{CONNECTIVITY_ACCESS.map((option) => (
									<option key={option} value={option}>
										{ACCESS_LABEL[option]}
									</option>
								))}
							</select>
						</div>

						<div className={styles.field}>
							<div className={styles.labelRow}>
								<label className={styles.label} htmlFor="connectivity-reliability">
									Reliability
								</label>
							</div>
							<select
								className={styles.input}
								id="connectivity-reliability"
								value={value.reliability ?? UNSET}
								onChange={(event) =>
									patch(
										"reliability",
										event.target.value === UNSET
											? undefined
											: (event.target.value as ConnectivityReliability),
									)
								}
							>
								<option value={UNSET}>{NOT_STATED_LABEL}</option>
								{CONNECTIVITY_RELIABILITY.map((option) => (
									<option key={option} value={option}>
										{RELIABILITY_LABEL[option]}
									</option>
								))}
							</select>
						</div>
					</div>

					<div className={styles.row}>
						<div className={styles.field}>
							<div className={styles.labelRow}>
								<label className={styles.label} htmlFor="connectivity-down">
									Download (Mbps)
								</label>
							</div>
							<input
								className={styles.input}
								id="connectivity-down"
								type="number"
								min="0"
								step="0.1"
								inputMode="decimal"
								value={downloadText}
								onChange={(event) => {
									setDownloadText(event.target.value);
									patch("downloadMbps", numberOrUnset(event.target.value));
								}}
							/>
						</div>
						<div className={styles.field}>
							<div className={styles.labelRow}>
								<label className={styles.label} htmlFor="connectivity-up">
									Upload (Mbps)
								</label>
							</div>
							<input
								className={styles.input}
								id="connectivity-up"
								type="number"
								min="0"
								step="0.1"
								inputMode="decimal"
								value={uploadText}
								onChange={(event) => {
									setUploadText(event.target.value);
									patch("uploadMbps", numberOrUnset(event.target.value));
								}}
							/>
						</div>
					</div>
					<p className={styles.hint}>
						A rough real-world figure is fine — it shows as approximate, never as a
						guarantee. Leave blank if you don&rsquo;t know.
					</p>

					<div className={styles.field}>
						<div className={styles.labelRow}>
							<label className={styles.label} htmlFor="connectivity-video">
								Video calls
							</label>
						</div>
						<select
							className={styles.input}
							id="connectivity-video"
							value={value.videoCallSuitable === undefined ? UNSET : value.videoCallSuitable ? "yes" : "no"}
							onChange={(event) =>
								patch(
									"videoCallSuitable",
									event.target.value === UNSET ? undefined : event.target.value === "yes",
								)
							}
						>
							<option value={UNSET}>{NOT_STATED_LABEL}</option>
							<option value="yes">Yes — video calls work</option>
							<option value="no">No — not good enough for video calls</option>
						</select>
					</div>

					<div className={styles.field}>
						<div className={styles.labelRow}>
							<label className={styles.label} htmlFor="connectivity-cap">
								Data limit
							</label>
						</div>
						<select
							className={styles.input}
							id="connectivity-cap"
							value={value.dataCapped === undefined ? UNSET : value.dataCapped ? "yes" : "no"}
							onChange={(event) =>
								patch(
									"dataCapped",
									event.target.value === UNSET ? undefined : event.target.value === "yes",
								)
							}
						>
							<option value={UNSET}>{NOT_STATED_LABEL}</option>
							<option value="yes">Yes — there is a data cap</option>
							<option value="no">No — unlimited</option>
						</select>
					</div>
				</>
			) : null}
		</div>
	);
}
