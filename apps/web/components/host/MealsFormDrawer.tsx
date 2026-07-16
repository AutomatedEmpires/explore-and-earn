"use client";

import { PhotoBucketDrawer, type PhotoBucketSlot } from "./PhotoBucketDrawer";
import styles from "./MealsFormDrawer.module.css";

export interface MealsFormDrawerProps {
	readonly open: boolean;
	readonly onClose: () => void;
	readonly listingId: string;
}

// The host's reusable meals photo bucket — four named slots.
const MEALS_SLOTS: readonly PhotoBucketSlot[] = [
	{ id: "kitchen", label: "Kitchen" },
	{ id: "prepared", label: "Prepared Meal" },
	{ id: "dining", label: "Dining Area" },
	{ id: "misc", label: "Misc" },
];

export function MealsFormDrawer({ open, onClose, listingId }: MealsFormDrawerProps) {
	return (
		<PhotoBucketDrawer
			open={open}
			onClose={onClose}
			listingId={listingId}
			kind="meals"
			title="Meal photos"
			subtitle="Fill each slot with a real photo so seekers know exactly what to expect."
			icon="benefit.meals"
			saveLabel="Save meal photos"
			slots={MEALS_SLOTS}
			styles={styles}
		/>
	);
}
