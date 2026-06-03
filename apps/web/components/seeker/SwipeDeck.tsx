"use client";

import { useState } from "react";

import { Button, DiscoveryCard } from "@explore-and-earn/ui";

import { EmptyState, toDiscoveryCardData, type DiscoveryListing } from "../discovery";
import styles from "./SwipeDeck.module.css";

export interface SwipeDeckProps {
	readonly listings: readonly DiscoveryListing[];
}

/**
 * SwipeDeck — the /swipe surface. Steps through matched opportunities one at a
 * time, each rendered by the SINGLE canonical DiscoveryCard on its "swipe"
 * surface (product-principles #2/#6 — one component, many surfaces). Pass /
 * Save / Quick Apply advance the deck; the end shows a summary + restart.
 *
 * UI-only (Sprint Zero): choices update local component state. No backend,
 * matching algorithm, or persistence — those arrive with the gated data layer.
 */
export function SwipeDeck({ listings }: SwipeDeckProps) {
	const [index, setIndex] = useState(0);
	const [savedCount, setSavedCount] = useState(0);

	const total = listings.length;
	const current = listings[index];

	if (!current) {
		const savedSummary =
			savedCount > 0
				? `You saved ${savedCount} ${savedCount === 1 ? "opportunity" : "opportunities"}. Find them under Saved, or run the deck again.`
				: "You've reviewed every matched opportunity. Start the deck over, or browse the full feed under Seek.";

		return (
			<div className={styles.deck}>
				<EmptyState title="You're all caught up" message={savedSummary} />
				<div className={styles.controls}>
					<Button
						variant="secondary"
						icon="action.back"
						onClick={() => {
							setIndex(0);
							setSavedCount(0);
						}}
					>
						Start over
					</Button>
				</div>
			</div>
		);
	}

	const advance = () => setIndex((value) => value + 1);
	const saveAndAdvance = () => {
		setSavedCount((value) => value + 1);
		advance();
	};

	return (
		<div className={styles.deck} aria-label="Matched opportunities">
			<p className={styles.progress}>
				Opportunity {index + 1} of {total}
			</p>
			<div className={styles.card}>
				<DiscoveryCard
					key={current.id}
					data={toDiscoveryCardData(current)}
					surface="swipe"
					actions={
						<>
							<Button variant="ghost" icon="action.close" onClick={advance}>
								Pass
							</Button>
							<Button variant="secondary" icon="action.save" onClick={saveAndAdvance}>
								Save
							</Button>
							<Button variant="primary" icon="action.apply" onClick={advance}>
								Quick Apply
							</Button>
						</>
					}
				/>
			</div>
		</div>
	);
}
