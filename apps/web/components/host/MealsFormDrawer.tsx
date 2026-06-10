"use client";

import { BenefitTrustModal } from "../discovery/BenefitTrustModal";

export interface MealsFormDrawerProps {
	readonly open: boolean;
	readonly onClose: () => void;
	readonly listingId: string;
}

export function MealsFormDrawer({ open, onClose, listingId }: MealsFormDrawerProps) {
	return (
		<BenefitTrustModal
			mode="edit"
			open={open}
			kind="meals"
			onClose={onClose}
			listingId={listingId}
		/>
	);
}
