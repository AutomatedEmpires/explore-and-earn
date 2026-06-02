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

// RESOLVED (founder-approved Option 1, 2026-05-31): "category.lodge" was removed
// from the icon registry so its category.* keys mirror MARKETPLACE_CATEGORIES
// exactly (farm/maritime/remote/seasonal/mix). Lodge is a setting/environment
// under Seasonal, NOT a top-level category; any future lodge-specific visual
// must use a separate namespace (e.g. environment.lodge), never category.*.
// TODO(CI drift check): fail the build if the icon registry's category.* keys
// diverge from MARKETPLACE_CATEGORIES. Tracked as a PR #4 follow-up.
