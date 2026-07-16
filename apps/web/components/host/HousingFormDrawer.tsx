"use client";

import { PhotoBucketDrawer, type PhotoBucketSlot } from "./PhotoBucketDrawer";
import styles from "./HousingFormDrawer.module.css";

export interface HousingFormDrawerProps {
	readonly open: boolean;
	readonly onClose: () => void;
	readonly listingId: string;
}

// The host's reusable housing photo bucket — four named slots.
const HOUSING_SLOTS: readonly PhotoBucketSlot[] = [
	{ id: "outside", label: "Outside" },
	{ id: "inside", label: "Inside" },
	{ id: "bathroom", label: "Bathroom" },
	{ id: "misc", label: "Misc" },
];

export function HousingFormDrawer({ open, onClose, listingId }: HousingFormDrawerProps) {
	return (
		<PhotoBucketDrawer
			open={open}
			onClose={onClose}
			listingId={listingId}
			kind="housing"
			title="Housing photos"
			subtitle="Fill each slot with a real photo so seekers know exactly what to expect."
			icon="benefit.housing"
			saveLabel="Save housing photos"
			slots={HOUSING_SLOTS}
			styles={styles}
		/>
	);
}
