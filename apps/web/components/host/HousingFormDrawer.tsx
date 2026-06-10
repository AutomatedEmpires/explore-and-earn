"use client";

import { BenefitTrustModal } from "../discovery/BenefitTrustModal";

export interface HousingFormDrawerProps {
	readonly open: boolean;
	readonly onClose: () => void;
	readonly listingId: string;
}

export function HousingFormDrawer({ open, onClose, listingId }: HousingFormDrawerProps) {
	return (
		<BenefitTrustModal
			mode="edit"
			open={open}
			kind="housing"
			onClose={onClose}
			listingId={listingId}
		/>
	);
}
