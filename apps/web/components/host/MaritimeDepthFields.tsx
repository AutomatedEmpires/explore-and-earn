"use client";

import { useState } from "react";

import {
	BERTH_TYPES,
	NOT_STATED_LABEL,
	VESSEL_TYPES,
	type BerthType,
	type MaritimeDepth,
	type VesselType,
} from "@explore-and-earn/contracts";

// Reuses the listing form's own field styling — this IS part of that form, and
// borrowing its classes keeps the group visually identical to every other field
// without a second stylesheet to drift.
import styles from "./ListingForm.module.css";

/**
 * The vessel — the host's answer to "what is the boat, and do I sleep on it?".
 *
 * THE HONESTY RULE THIS UI ENFORCES: every control defaults to "Not stated" and
 * nothing is pre-filled. A pre-selected "Sleep aboard: yes" would manufacture
 * the single most decision-changing claim on the panel — one that decides
 * whether a seeker must find and pay for housing ashore. Leaving a field alone
 * is a first-class outcome: it stores no key, and the listing honestly reads
 * "Not stated".
 *
 * "No — you arrange your own housing ashore" is a REAL answer worth giving, so
 * it is offered as plainly as "Yes", and choosing it collapses only the berth
 * privacy question (a listing can never say "you don't sleep aboard" and
 * "private cabin" at once; the contract drops it anyway). It deliberately does
 * NOT collapse vessel type, length or crew — not sleeping aboard says nothing
 * about how big the boat is or who is on it.
 */

const VESSEL_TYPE_LABEL: Record<VesselType, string> = {
	sailing_yacht: "Sailing yacht",
	motor_yacht: "Motor yacht",
	tall_ship: "Tall ship",
	fishing_vessel: "Fishing vessel",
	charter_boat: "Charter boat",
	workboat: "Workboat",
	liveaboard: "Liveaboard",
};

const BERTH_TYPE_LABEL: Record<BerthType, string> = {
	private_cabin: "Private cabin",
	shared_cabin: "Shared cabin",
	bunk_shared: "Bunk in shared quarters",
};

/** The select value meaning "the host has not answered" — never persisted. */
const UNSET = "";

/** Seed a number input from a stored value; unstated shows an empty box. */
function numberText(stored: number | undefined): string {
	return stored === undefined ? "" : String(stored);
}

export interface MaritimeDepthFieldsProps {
	readonly value: MaritimeDepth;
	readonly onChange: (next: MaritimeDepth) => void;
}

export function MaritimeDepthFields({ value, onChange }: MaritimeDepthFieldsProps) {
	/**
	 * The number inputs keep their own text while the host types.
	 *
	 * Only a positive number is ever a stated figure, so "0" alone stores
	 * nothing — but it is also the first keystroke of "0.5", and a rendered value
	 * fed back from the stored number would erase it before the "." was typed.
	 * The text is what the host sees; the parent still only ever receives a valid
	 * number or nothing at all.
	 */
	const [lengthText, setLengthText] = useState(() => numberText(value.lengthFeet));
	const [crewText, setCrewText] = useState(() => numberText(value.crewSize));

	/** Set one key, or REMOVE it entirely when the host clears the control. */
	function patch<K extends keyof MaritimeDepth>(key: K, next: MaritimeDepth[K] | undefined) {
		const draft: Record<string, unknown> = { ...value };
		if (next === undefined) delete draft[key];
		else draft[key] = next;
		onChange(draft as MaritimeDepth);
	}

	function setBerthAboard(raw: string) {
		const draft: Record<string, unknown> = { ...value };
		if (raw === UNSET) {
			// Back to unanswered — drop the answer AND the berth detail that only
			// made sense as a description of it. Note it does NOT drop the vessel
			// type, length or crew: those are still true, and still stated.
			delete draft.berthAboard;
			delete draft.berthType;
			onChange(draft as MaritimeDepth);
			return;
		}
		if (raw === "no") {
			// "You don't sleep aboard" — berth privacy is incoherent now. Everything
			// else the host stated about the vessel still stands.
			delete draft.berthType;
			draft.berthAboard = false;
			onChange(draft as MaritimeDepth);
			return;
		}
		patch("berthAboard", true);
	}

	/** Number input → value, or undefined when cleared/invalid (= not stated). */
	function numberOrUnset(raw: string): number | undefined {
		if (raw.trim() === "") return undefined;
		const parsed = Number(raw);
		return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
	}

	const berthAboardValue =
		value.berthAboard === undefined ? UNSET : value.berthAboard ? "yes" : "no";
	const describesBerth = value.berthAboard !== false;

	return (
		<div className={styles.field}>
			<div className={styles.labelRow}>
				<span className={styles.label} id="maritime-label">
					The vessel
				</span>
			</div>
			<p className={styles.hint}>
				Only answer what you know. Anything you leave alone shows as
				&ldquo;{NOT_STATED_LABEL}&rdquo; — never as a promise.
			</p>

			<div className={styles.row}>
				<div className={styles.field}>
					<div className={styles.labelRow}>
						<label className={styles.label} htmlFor="maritime-vessel-type">
							Vessel type
						</label>
					</div>
					<select
						className={styles.input}
						id="maritime-vessel-type"
						value={value.vesselType ?? UNSET}
						onChange={(event) =>
							patch(
								"vesselType",
								event.target.value === UNSET
									? undefined
									: (event.target.value as VesselType),
							)
						}
					>
						<option value={UNSET}>{NOT_STATED_LABEL}</option>
						{VESSEL_TYPES.map((type) => (
							<option key={type} value={type}>
								{VESSEL_TYPE_LABEL[type]}
							</option>
						))}
					</select>
				</div>
				<div className={styles.field}>
					<div className={styles.labelRow}>
						<label className={styles.label} htmlFor="maritime-length">
							Approx. length (ft)
						</label>
					</div>
					<input
						className={styles.input}
						id="maritime-length"
						type="number"
						min="0"
						step="1"
						inputMode="decimal"
						value={lengthText}
						onChange={(event) => {
							setLengthText(event.target.value);
							patch("lengthFeet", numberOrUnset(event.target.value));
						}}
					/>
				</div>
			</div>

			<div className={styles.field}>
				<div className={styles.labelRow}>
					<label className={styles.label} htmlFor="maritime-berth-aboard">
						Does the crew sleep aboard?
					</label>
				</div>
				<select
					className={styles.input}
					id="maritime-berth-aboard"
					value={berthAboardValue}
					onChange={(event) => setBerthAboard(event.target.value)}
				>
					<option value={UNSET}>{NOT_STATED_LABEL}</option>
					<option value="yes">Yes — there&rsquo;s a berth aboard</option>
					<option value="no">No — crew arrange their own housing ashore</option>
				</select>
				<p className={styles.hint}>
					This one matters most: it decides whether someone needs to find and pay for a
					place to live.
				</p>
			</div>

			<div className={styles.row}>
				{describesBerth ? (
					<div className={styles.field}>
						<div className={styles.labelRow}>
							<label className={styles.label} htmlFor="maritime-berth-type">
								Their berth
							</label>
						</div>
						<select
							className={styles.input}
							id="maritime-berth-type"
							value={value.berthType ?? UNSET}
							onChange={(event) =>
								patch(
									"berthType",
									event.target.value === UNSET
										? undefined
										: (event.target.value as BerthType),
								)
							}
						>
							<option value={UNSET}>{NOT_STATED_LABEL}</option>
							{BERTH_TYPES.map((type) => (
								<option key={type} value={type}>
									{BERTH_TYPE_LABEL[type]}
								</option>
							))}
						</select>
					</div>
				) : null}
				<div className={styles.field}>
					<div className={styles.labelRow}>
						<label className={styles.label} htmlFor="maritime-crew">
							Crew aboard (including them)
						</label>
					</div>
					<input
						className={styles.input}
						id="maritime-crew"
						type="number"
						min="0"
						step="1"
						inputMode="numeric"
						value={crewText}
						onChange={(event) => {
							setCrewText(event.target.value);
							patch("crewSize", numberOrUnset(event.target.value));
						}}
					/>
				</div>
			</div>
		</div>
	);
}
