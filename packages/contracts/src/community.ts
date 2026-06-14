export const ANNOUNCEMENT_DURATIONS = [7, 14, 28] as const;
export type AnnouncementDuration = (typeof ANNOUNCEMENT_DURATIONS)[number];

export const ANNOUNCEMENT_PRICING: Record<AnnouncementDuration, number> = {
  7:  15000,
  14: 25000,
  28: 35000,
};

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
