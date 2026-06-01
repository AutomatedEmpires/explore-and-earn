/**
 * Opportunity categories (visual lanes + filtering).
 *
 * The canonical tuple lives in ./enums (MARKETPLACE_CATEGORIES). This module
 * adds category-derived contracts used by media + the discovery card WITHOUT
 * redefining the source enum.
 *
 * Source of truth (Notion): Canonical Enum Registry, Discovery Card V1,
 * Curated Photo Library V1.
 */
import { MARKETPLACE_CATEGORIES, type MarketplaceCategory } from "./enums";

/** Readability alias for call sites that talk about "opportunities". */
export type OpportunityCategory = MarketplaceCategory;

/** Curated photo buckets exclude "mix" (locked, Photo Buckets V1). */
export type CuratedPhotoCategory = Exclude<MarketplaceCategory, "mix">;

export const CURATED_PHOTO_CATEGORIES = MARKETPLACE_CATEGORIES.filter(
	(c): c is CuratedPhotoCategory => c !== "mix",
);

// TODO(?): DRIFT — the icon registry (packages/ui/src/icons/registry.ts)
// currently ships "category.lodge" while the canonical category enum uses
// "seasonal" + "mix". Do NOT resolve unilaterally; this is a founder approval
// gate (canon reconciliation). Tracked in docs/source-of-truth/open-questions.md.
