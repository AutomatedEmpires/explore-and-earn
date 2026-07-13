"use client";

import { useEffect, useState } from "react";
import type { OpportunityCategory } from "@explore-and-earn/contracts";
import { Button, Icon } from "@explore-and-earn/ui";

import { PopupShell } from "../overlay/PopupShell";
import { CATEGORY_ICON, CATEGORY_LABEL } from "../discovery";
import styles from "./SeekControlPopup.module.css";

export interface SeekSortPopupProps {
	readonly open: boolean;
	readonly onClose: () => void;
	readonly category?: string;
	readonly onApply: (category: OpportunityCategory | null) => void;
}

// The four canonical lanes only — founder order (Maritime · Remote · Seasonal ·
// Farm). `null` is the "All lanes" reset, not a lane. `mix` is deliberately not
// offered here: sort segments the browse view by a single real category.
const CATEGORY_OPTIONS: readonly (OpportunityCategory | null)[] = [
	null,
	"maritime",
	"remote",
	"seasonal",
	"farm",
];

export function SeekSortPopup({
	open,
	onClose,
	category,
	onApply,
}: SeekSortPopupProps) {
	const [draft, setDraft] = useState<OpportunityCategory | null>(
		(category as OpportunityCategory | undefined) ?? null,
	);

	useEffect(() => {
		if (open) {
			setDraft((category as OpportunityCategory | undefined) ?? null);
		}
	}, [open, category]);

	return (
		<PopupShell
			open={open}
			onClose={onClose}
			title="Sort"
			eyebrow={
				<>
					<Icon name="action.sort" size={16} aria-hidden />
					<span>Lane sort</span>
				</>
			}
			headerMeta={<span>Maritime, remote, seasonal, farm</span>}
			footer={
				<div className={styles.footer}>
					<Button variant="ghost" onClick={() => setDraft(null)}>
						Clear
					</Button>
					<Button variant="primary" onClick={() => onApply(draft)}>
						Apply
					</Button>
				</div>
			}
			size="compact"
		>
			<div className={styles.optionList}>
				{CATEGORY_OPTIONS.map((option) => {
					const selected = draft === option;
					const icon = option ? CATEGORY_ICON[option] : "action.sort";
					const label = option ? CATEGORY_LABEL[option] : "All lanes";
					const meta = option ? `${label} opportunities` : "Everything";
					return (
						<button
							key={option ?? "all"}
							type="button"
							className={selected ? `${styles.option} ${styles.optionActive}` : styles.option}
							onClick={() => setDraft(option)}
						>
							<span className={styles.optionLead}>
								<Icon name={icon} size={20} aria-hidden />
								<span className={styles.optionText}>
									<span className={styles.optionLabel}>{label}</span>
									<span className={styles.optionMeta}>{meta}</span>
								</span>
							</span>
							{selected ? <Icon name="system.success" size={16} aria-hidden /> : null}
						</button>
					);
				})}
			</div>
		</PopupShell>
	);
}