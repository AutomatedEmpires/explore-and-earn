export const BADGE_KEYS = {
  RESUME_STARTED: "resume_started",
  RESUME_COMPLETE: "resume_complete",
  FIRST_APPLICATION: "first_application",
  FIRST_ACCEPTED: "first_accepted",
  TRAVELER_3: "traveler_3",
  TRAVELER_5: "traveler_5",
  CERTIFICATIONS_ADDED: "certifications_added",
} as const;

export type BadgeKey = (typeof BADGE_KEYS)[keyof typeof BADGE_KEYS];

export interface SeekerBadge {
  readonly id: string;
  readonly badgeKey: BadgeKey;
  readonly awardedAt: string;
  readonly metadata: Record<string, unknown> | null;
}

export const BADGE_META: Record<
  BadgeKey,
  { readonly label: string; readonly description: string; readonly icon: string }
> = {
  [BADGE_KEYS.RESUME_STARTED]: {
    label: "First steps",
    description: "Started building your seeker profile.",
    icon: "nav.profile",
  },
  [BADGE_KEYS.RESUME_COMPLETE]: {
    label: "Profile complete",
    description: "Reached 80% resume completion.",
    icon: "system.success",
  },
  [BADGE_KEYS.FIRST_APPLICATION]: {
    label: "First apply",
    description: "Applied to your first opportunity.",
    icon: "action.apply",
  },
  [BADGE_KEYS.FIRST_ACCEPTED]: {
    label: "First accepted",
    description: "Your first application was accepted — adventure awaits.",
    icon: "status.match",
  },
  [BADGE_KEYS.TRAVELER_3]: {
    label: "Wanderer",
    description: "Three accepted roles — you're building a story.",
    icon: "mappin.cluster",
  },
  [BADGE_KEYS.TRAVELER_5]: {
    label: "Explorer",
    description: "Five accepted roles — true explorer status.",
    icon: "analytics.trend",
  },
  [BADGE_KEYS.CERTIFICATIONS_ADDED]: {
    label: "Certified",
    description: "Added certifications to boost your match confidence.",
    icon: "status.boosted",
  },
};
