"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Icon } from "@explore-and-earn/ui";

import { PopupShell } from "../overlay/PopupShell";
import styles from "./SeekControlPopup.module.css";

type StartRangeMonths = 1 | 3 | 6;
type PayUnit = "hour" | "day";

export interface SeekFilterPopupValue {
	readonly housing: boolean;
	readonly meals: boolean;
	readonly visaSupport: boolean;
	readonly startRangeMonths?: StartRangeMonths;
	readonly payMin?: number;
	readonly payUnit?: PayUnit;
}

export interface SeekFilterPopupProps {
	readonly open: boolean;
	readonly onClose: () => void;
	readonly value: SeekFilterPopupValue;
	readonly onApply: (value: SeekFilterPopupValue) => void;
}

const START_RANGE_OPTIONS: readonly StartRangeMonths[] = [1, 3, 6];
const PAY_UNIT_OPTIONS: readonly PayUnit[] = ["hour", "day"];

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

	const summary = useMemo(() => {
		const items: string[] = [];
		if (draft.startRangeMonths) {
			items.push(`${draft.startRangeMonths} month`);
		}
		if (draft.visaSupport) {
			items.push("Visa");
		}
		if (draft.housing) {
			items.push("Housing");
		}
		if (draft.meals) {
			items.push("Meals");
		}
		if (draft.payMin) {
			items.push(formatPayValue(draft.payMin, draft.payUnit));
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
			headerMeta={<span>Start range, visa, pay, housing, meals</span>}
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
						onClick={() =>
							setDraft({
								housing: false,
								meals: false,
								visaSupport: false,
							})
						}
					>
						Clear
					</Button>
					<Button variant="primary" onClick={() => onApply(draft)}>
						Apply
					</Button>
				</div>
			}
			size="wide"
		>
			<section className={styles.group} aria-label="Start range">
				<h3 className={styles.groupLabel}>Start range</h3>
				<div className={styles.chipRow}>
					{START_RANGE_OPTIONS.map((option) => {
						const selected = draft.startRangeMonths === option;
						return (
							<button
								key={option}
								type="button"
								className={selected ? `${styles.chip} ${styles.chipActive}` : styles.chip}
								onClick={() =>
									setDraft((current) => ({
										...current,
										startRangeMonths: current.startRangeMonths === option ? undefined : option,
									}))
								}
							>
								{option} month{option === 1 ? "" : "s"}
							</button>
						);
					})}
				</div>
			</section>

			<section className={styles.group} aria-label="Visa support">
				<h3 className={styles.groupLabel}>Visa</h3>
				<div className={styles.chipRow}>
					<button
						type="button"
						className={draft.visaSupport ? `${styles.chip} ${styles.chipActive}` : styles.chip}
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

			<section className={styles.group} aria-label="Pay filter">
				<h3 className={styles.groupLabel}>Pay scale</h3>
				<div className={styles.chipRow}>
					{PAY_UNIT_OPTIONS.map((unit) => {
						const selected = draft.payUnit === unit;
						return (
							<button
								key={unit}
								type="button"
								className={selected ? `${styles.chip} ${styles.chipActive}` : styles.chip}
								onClick={() =>
									setDraft((current) => ({
										...current,
										payUnit: current.payUnit === unit ? undefined : unit,
									}))
								}
							>
								{unit}
							</button>
						);
					})}
				</div>
				<div className={styles.rangeWrap}>
					<div className={styles.rangeHeader}>
						<span className={styles.rangeValue}>
							{formatPayValue(draft.payMin, draft.payUnit)}
						</span>
						<span className={styles.rangeMeta}>minimum</span>
					</div>
					<input
						className={styles.range}
						type="range"
						min={0}
						max={draft.payUnit === "day" ? 400 : 40}
						step={draft.payUnit === "day" ? 10 : 1}
						value={draft.payMin ?? 0}
						onChange={(event) => {
							const next = Number(event.target.value);
							setDraft((current) => ({
								...current,
								payMin: next > 0 ? next : undefined,
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
						onClick={() =>
							setDraft((current) => ({ ...current, meals: !current.meals }))
						}
					>
						<Icon name="benefit.meals" size={16} aria-hidden />
						Meals included
					</button>
				</div>
			</section>
		</PopupShell>
	);
}