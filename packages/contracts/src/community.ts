import { ADDON_PRICING } from "./pricing";

// Paid announcement placement (once the plan's free monthly quota is used) —
// flat price, single 7-day run, no duration options (founder directive
// 2026-06-21, pricing.ts ADDON_PRICING.additionalAnnouncement). DERIVED from
// pricing.ts so the two can never drift out of sync again — this previously
// existed as an independent 7/14/28-day ANNOUNCEMENT_PRICING record that
// disagreed with the founder-locked constant.
export const ANNOUNCEMENT_RUN_DAYS = ADDON_PRICING.additionalAnnouncement.runDays;
export const ANNOUNCEMENT_PRICE_CENTS = ADDON_PRICING.additionalAnnouncement.priceCents;

// Free, plan-included announcements (within ANNOUNCEMENT_MONTHLY_QUOTA) run
// for a full month — a longer, unrelated window from the 7-day paid slot.
export const ANNOUNCEMENT_FREE_DURATION_DAYS = 30;

export const ANNOUNCEMENT_MONTHLY_QUOTA: Record<string, number> = {
  none:         0,
  starter:      0,
  professional: 1,
  enterprise:   3,
};

export type AnnouncementKind = "general" | "hiring" | "event";

// ─── Engagement types ─────────────────────────────────────────────────────────

export type ReactionKey = "smile" | "heart" | "hundred" | "clap" | "sparkle";

export const REACTION_KEYS: readonly ReactionKey[] = [
  "smile", "heart", "hundred", "clap", "sparkle",
] as const;

export const REACTION_EMOJIS: Record<ReactionKey, string> = {
  smile:   "😄",
  heart:   "❤️",
  hundred: "💯",
  clap:    "🙌",
  sparkle: "✨",
};

export interface ReactionCounts {
  readonly smile:   number;
  readonly heart:   number;
  readonly hundred: number;
  readonly clap:    number;
  readonly sparkle: number;
  readonly userReactions: readonly ReactionKey[];
}

export const ZERO_REACTIONS: ReactionCounts = {
  smile: 0, heart: 0, hundred: 0, clap: 0, sparkle: 0,
  userReactions: [],
};

export interface CommunityComment {
  readonly id:          string;
  readonly targetType:  "photo" | "announcement";
  readonly targetId:    string;
  readonly clerkUserId: string;
  readonly authorName:  string;
  readonly body:        string;
  readonly createdAt:   string;
}

// ─── Content types ────────────────────────────────────────────────────────────

export interface CommunityPhoto {
  readonly id:             string;
  readonly seekerProfileId: string;
  readonly authorName:     string;
  readonly storageUrl:     string;
  readonly caption:        string | null;
  readonly locationTag:    string | null;
  readonly createdAt:      string;
  readonly reactionCounts?: ReactionCounts;
  readonly commentCount?:  number;
}

export interface HostAnnouncement {
  readonly id:             string;
  readonly hostProfileId:  string;
  readonly hostName:       string;
  readonly title:          string;
  readonly body:           string;
  readonly kind:           AnnouncementKind;
  readonly expiresAt:      string;
  readonly createdAt:      string;
  readonly isPurchased:    boolean;
  readonly reactionCounts?: ReactionCounts;
  readonly commentCount?:  number;
}
