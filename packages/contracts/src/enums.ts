export const MARKETPLACE_CATEGORIES = [
  "farm",
  "maritime",
  "remote",
  "seasonal",
  "mix"
] as const;

export const ACTIVE_SCOPES = [
  "seeker",
  "host",
  "admin",
  "platform"
] as const;

export type MarketplaceCategory = (typeof MARKETPLACE_CATEGORIES)[number];
export type ActiveScope = (typeof ACTIVE_SCOPES)[number];