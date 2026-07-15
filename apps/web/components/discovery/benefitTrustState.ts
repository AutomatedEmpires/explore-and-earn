export type BenefitEditorMode = "edit" | "view";

export type BenefitDismissBlocker = "uploading" | "dirty" | null;

export function benefitDismissBlocker(
	mode: BenefitEditorMode,
	dirty: boolean,
	uploading: boolean,
): BenefitDismissBlocker {
	if (mode !== "edit") return null;
	if (uploading) return "uploading";
	return dirty ? "dirty" : null;
}

export function publicBenefitPhotoStatus(
	hydrating: boolean,
	unavailable: boolean,
): "Loading photo" | "Details unavailable" | "Photo not published" {
	if (hydrating) return "Loading photo";
	return unavailable ? "Details unavailable" : "Photo not published";
}
