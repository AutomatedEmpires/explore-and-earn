export const LISTING_STATUSES = [
  "draft",
  "under_review",
  "live",
  "paused",
  "closed",
  "archived"
] as const;

export type ListingStatus = (typeof LISTING_STATUSES)[number];

// TODO: Mirror the remaining canonical lifecycle registries once the repo docs
// source-of-truth export is populated.