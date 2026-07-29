"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Icon } from "@explore-and-earn/ui";

import { PopupShell } from "../overlay/PopupShell";
import styles from "./SeekControlPopup.module.css";

type StartRangeMonths = 1 | 3 | 6;
type PayUnit = "hour" | "day";

/**
 * THE FILTER SET IS THE QUERY'S FILTER SET, EXACTLY.
 *
 * Every field below maps to one predicate in `searchListings` (packages/db):
 *
 *   housing        → listings.housing_included = true
 *   meals          → listings.meals_included   = true
 *   visaSupport    → listings.visa_support     = true
 *   payMin/payUnit → compensation_min_cents >= n AND compensation_unit = unit
 *   startRangeMonths → begins_at BETWEEN today AND today + n months
 *   startAfter/Before→ begins_at >= / <= an explicit date
 *   location       → location_display ILIKE %term% (trigram-indexed, 051)
 *
 * Nothing else is offered, because nothing else is filterable. Weekly hours,
 * openings, and application deadlines have NO columns; experience level and
 * certifications have columns (051) but no predicate in searchListings, so a
 * control for them would either silently do nothing or force a client-side
 * filter that lies across page boundaries. The gaps are listed in the PR rather
 * than papered over with dead controls.
 */
export interface SeekFilterPopupValue {
	readonly housing: boolean;
	readonly meals: boolean;
	readonly visaSupport: boolean;
	readonly startRangeMonths?: StartRangeMonths;
	readonly payMin?: number;
	readonly payUnit?: PayUnit;
	/** Free-text place match against `location_display`. */
	readonly location?: string;
	/** ISO yyyy-mm-dd bounds on `begins_at`. */
	readonly startAfter?: string;
	readonly startBefore?: string;
}

export interface SeekFilterPopupProps {
	readonly open: boolean;
	readonly onClose: () => void;
	readonly value: SeekFilterPopupValue;
	readonly onApply: (value: SeekFilterPopupValue) => void;
}

const START_RANGE_OPTIONS: readonly StartRangeMonths[] = [1, 3, 6];
const PAY_UNIT_OPTIONS: readonly PayUnit[] = ["hour", "day"];

// Per-unit slider bounds. Hour work tops out far lower than day rates, so each
// unit gets its own ceiling + step to keep the slider's resolution usable.
const PAY_MAX: Record<PayUnit, number> = { hour: 40, day: 400 };
const PAY_STEP: Record<PayUnit, number> = { hour: 1, day: 10 };

const EMPTY_DRAFT: SeekFilterPopupValue = {
	housing: false,
	meals: false,
	visaSupport: false,
};

function formatPayValue(payMin: number | undefined, payUnit: PayUnit | undefined) {
	if (!payMin) {
		return "$0";
	}
	return payUnit ? `$${payMin}/${payUnit}` : `$${payMin}`;
}

export function SeekFilterPopup({
	open,
	onClose,
	value,
	onApply,
}: SeekFilterPopupProps) {
	const [draft, setDraft] = useState<SeekFilterPopupValue>(value);

	useEffect(() => {
		if (open) {
			setDraft(value);
		}
	}, [open, value]);

	// Effective unit drives the slider scale even before the seeker taps a unit;
	// hour is the sensible default for browse.
	const effectiveUnit: PayUnit = draft.payUnit ?? "hour";
	const payMax = PAY_MAX[effectiveUnit];
	const payStep = PAY_STEP[effectiveUnit];

	// Selecting a unit re-scales any existing floor to the new ceiling so a
	// $300/day floor doesn't silently become an out-of-range $300/hour.
	const selectUnit = (unit: PayUnit) =>
		setDraft((current) => ({
			...current,
			payUnit: unit,
			payMin:
				current.payMin != null
					? Math.min(current.payMin, PAY_MAX[unit])
					: current.payMin,
		}));

	const activeCount = useMemo(() => {
		let count = 0;
		if (draft.payMin && draft.payMin > 0) count += 1;
		if (draft.housing) count += 1;
		if (draft.meals) count += 1;
		if (draft.visaSupport) count += 1;
		if (draft.startRangeMonths) count += 1;
		if (draft.location?.trim()) count += 1;
		if (draft.startAfter || draft.startBefore) count += 1;
		return count;
	}, [draft]);

	const summary = useMemo(() => {
		const items: string[] = [];
		if (draft.payMin) {
			items.push(formatPayValue(draft.payMin, draft.payUnit));
		}
		if (draft.housing) {
			items.push("Housing");
		}
		if (draft.meals) {
			items.push("Meals");
		}
		if (draft.visaSupport) {
			items.push("Visa");
		}
		if (draft.startRangeMonths) {
			items.push(`${draft.startRangeMonths} month`);
		}
		if (draft.location?.trim()) {
			items.push(draft.location.trim());
		}
		if (draft.startAfter || draft.startBefore) {
			items.push(`${draft.startAfter ?? "any"} → ${draft.startBefore ?? "any"}`);
		}
		return items;
	}, [draft]);

	return (
		<PopupShell
			open={open}
			onClose={onClose}
			title="Filter"
			eyebrow={
				<>
					<Icon name="action.filter" size={16} aria-hidden />
					<span>Seek filters</span>
				</>
			}
			headerMeta={<span>Pay, housing, meals, visa, begins range</span>}
			headerTags={
				summary.length > 0 ? (
					<div className={styles.summary}>
						{summary.map((item) => (
							<span key={item} className={styles.summaryPill}>
								{item}
							</span>
						))}
					</div>
				) : null
			}
			footer={
				<div className={styles.footer}>
					<Button
						variant="ghost"
						disabled={activeCount === 0}
						onClick={() => setDraft(EMPTY_DRAFT)}
					>
						{activeCount > 0 ? `Clear all (${activeCount})` : "Clear all"}
					</Button>
					<Button variant="primary" onClick={() => onApply(draft)}>
						Apply
					</Button>
				</div>
			}
			size="wide"
		>
			<section className={styles.group} aria-label="Pay range">
				<h3 className={styles.groupLabel}>Pay range</h3>
				<div
					className={styles.segment}
					role="group"
					aria-label="Pay unit"
				>
					{PAY_UNIT_OPTIONS.map((unit) => {
						const selected = effectiveUnit === unit;
						return (
							<button
								key={unit}
								type="button"
								className={
									selected
										? `${styles.segmentButton} ${styles.segmentButtonActive}`
										: styles.segmentButton
								}
								aria-pressed={selected}
								onClick={() => selectUnit(unit)}
							>
								<Icon name="benefit.pay" size={16} aria-hidden />
								Per {unit}
							</button>
						);
					})}
				</div>
				<div className={styles.rangeWrap}>
					<div className={styles.rangeHeader}>
						<span className={styles.rangeValue}>
							{formatPayValue(draft.payMin, effectiveUnit)}
						</span>
						<span className={styles.rangeMeta}>minimum</span>
					</div>
					<input
						className={styles.range}
						type="range"
						min={0}
						max={payMax}
						step={payStep}
						value={draft.payMin ?? 0}
						aria-label={`Minimum pay per ${effectiveUnit}`}
						aria-valuetext={
							draft.payMin
								? `${formatPayValue(draft.payMin, effectiveUnit)} minimum`
								: "No minimum"
						}
						onChange={(event) => {
							const next = Number(event.target.value);
							setDraft((current) => ({
								...current,
								payMin: next > 0 ? next : undefined,
								// A floor implies a unit — default to hour so the emitted
								// filter is always unit-scoped, never an ambiguous raw rate.
								payUnit: next > 0 ? current.payUnit ?? "hour" : current.payUnit,
							}));
						}}
					/>
				</div>
			</section>

			<section className={styles.group} aria-label="Included benefits">
				<h3 className={styles.groupLabel}>Included</h3>
				<div className={styles.chipRow}>
					<button
						type="button"
						className={draft.housing ? `${styles.chip} ${styles.chipActive}` : styles.chip}
						aria-pressed={draft.housing}
						onClick={() =>
							setDraft((current) => ({ ...current, housing: !current.housing }))
						}
					>
						<Icon name="benefit.housing" size={16} aria-hidden />
						Housing included
					</button>
					<button
						type="button"
						className={draft.meals ? `${styles.chip} ${styles.chipActive}` : styles.chip}
						aria-pressed={draft.meals}
						onClick={() =>
							setDraft((current) => ({ ...current, meals: !current.meals }))
						}
					>
						<Icon name="benefit.meals" size={16} aria-hidden />
						Meals included
					</button>
				</div>
			</section>

			<section className={styles.group} aria-label="Visa support">
				<h3 className={styles.groupLabel}>Visa</h3>
				<div className={styles.chipRow}>
					<button
						type="button"
						className={draft.visaSupport ? `${styles.chip} ${styles.chipActive}` : styles.chip}
						aria-pressed={draft.visaSupport}
						onClick={() =>
							setDraft((current) => ({
								...current,
								visaSupport: !current.visaSupport,
							}))
						}
					>
						<Icon name="system.info" size={16} aria-hidden />
						Visa support
					</button>
				</div>
			</section>

			<section className={styles.group} aria-label="Begins range">
				<h3 className={styles.groupLabel}>Begins range</h3>
				<div className={styles.chipRow}>
					{START_RANGE_OPTIONS.map((option) => {
						const selected = draft.startRangeMonths === option;
						return (
							<button
								key={option}
								type="button"
								className={selected ? `${styles.chip} ${styles.chipActive}` : styles.chip}
								aria-pressed={selected}
								onClick={() =>
									setDraft((current) => ({
										...current,
										startRangeMonths:
											current.startRangeMonths === option ? undefined : option,
									}))
								}
							>
								<Icon name="status.begins" size={16} aria-hidden />
								{option} month{option === 1 ? "" : "s"}
							</button>
						);
					})}
				</div>
			</section>

			{/* Both sections below map to real, indexed predicates and neither had a
			    control until now — the server page has always parsed ?location,
			    ?start_after and ?start_before, so two working filters were
			    unreachable from the UI. */}
			<section className={styles.group} aria-label="Place">
				<h3 className={styles.groupLabel}>Place</h3>
				<label className={styles.field}>
					<span className={styles.fieldLabel}>Location contains</span>
					<input
						type="text"
						className={styles.fieldInput}
						value={draft.location ?? ""}
						placeholder="Idaho, Coeur d&rsquo;Alene, coast…"
						onChange={(event) =>
							setDraft((current) => ({
								...current,
								location: event.target.value || undefined,
							}))
						}
					/>
				</label>
				<p className={styles.fieldNote}>
					Matches the place the host wrote on the listing. It is a text match,
					not a distance search — there is no radius filter, because listings
					store a single host-placed point and no travel distance.
				</p>
			</section>

			<section className={styles.group} aria-label="Start-date window">
				<h3 className={styles.groupLabel}>Exact start window</h3>
				<div className={styles.fieldRow}>
					<label className={styles.field}>
						<span className={styles.fieldLabel}>Starts on or after</span>
						<input
							type="date"
							className={styles.fieldInput}
							value={draft.startAfter ?? ""}
							onChange={(event) =>
								setDraft((current) => ({
									...current,
									startAfter: event.target.value || undefined,
								}))
							}
						/>
					</label>
					<label className={styles.field}>
						<span className={styles.fieldLabel}>Starts on or before</span>
						<input
							type="date"
							className={styles.fieldInput}
							value={draft.startBefore ?? ""}
							onChange={(event) =>
								setDraft((current) => ({
									...current,
									startBefore: event.target.value || undefined,
								}))
							}
						/>
					</label>
				</div>
			</section>
		</PopupShell>
	);
}
