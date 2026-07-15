/**
 * Seeker badges — a light, on-brand achievement system.
 *
 * Each badge maps to a MACHINE-CHECKABLE criterion over `SeekerBadgeStats` (a
 * snapshot of the seeker's current activity). Awarding is reconcile-from-state,
 * not event-plumbing: `qualifyingBadges(stats)` returns every earned key, and the
 * award layer inserts any that are new (idempotent via the seeker_badges unique
 * constraint). That means a badge is granted the moment the seeker's state
 * qualifies, regardless of which action got them there — no missed events.
 *
 * Adding a badge: add a key + a BADGE_META entry (label/description/icon/group/
 * tier/criterion). Icons must be real `<Icon>` registry keys (G30).
 */

export const BADGE_KEYS = {
  // ── Profile & résumé ──
  RESUME_STARTED: "resume_started",
  BIO_ADDED: "bio_added",
  PHOTO_ADDED: "photo_added",
  SKILL_ADDED: "skill_added",
  SKILLS_5: "skills_5",
  EXPERIENCE_ADDED: "experience_added",
  EDUCATION_ADDED: "education_added",
  CERTIFICATIONS_ADDED: "certifications_added",
  RESUME_HALF: "resume_half",
  RESUME_COMPLETE: "resume_complete",
  // ── Applications ──
  FIRST_APPLICATION: "first_application",
  APPLY_5: "apply_5",
  APPLY_10: "apply_10",
  APPLY_25: "apply_25",
  APPLY_50: "apply_50",
  WELL_ROUNDED: "well_rounded",
  // ── Discovery / saving ──
  FIRST_SAVE: "first_save",
  SAVE_10: "save_10",
  SAVE_25: "save_25",
  SAVE_50: "save_50",
  // ── Outcomes ──
  FIRST_OFFER: "first_offer",
  OFFER_3: "offer_3",
  FIRST_ACCEPTED: "first_accepted",
  TRAVELER_3: "traveler_3",
  TRAVELER_5: "traveler_5",
  TRAVELER_10: "traveler_10",
  // ── Community / demand ──
  FIRST_INVITE: "first_invite",
  INVITE_5: "invite_5",
} as const;

export type BadgeKey = (typeof BADGE_KEYS)[keyof typeof BADGE_KEYS];

export interface SeekerBadge {
  readonly id: string;
  readonly badgeKey: BadgeKey;
  readonly awardedAt: string;
  readonly metadata: Record<string, unknown> | null;
}

/** A snapshot of the seeker's current state, the input to badge evaluation. */
export interface SeekerBadgeStats {
  readonly resumeCompletion: number; // 0–100
  readonly hasBio: boolean;
  readonly hasPhoto: boolean;
  readonly skillsCount: number;
  readonly experiencesCount: number;
  readonly educationsCount: number;
  readonly certificationsCount: number;
  readonly appliedCount: number;
  readonly savedCount: number;
  readonly offersCount: number;
  readonly acceptedCount: number;
  readonly invitesCount: number;
  readonly lanesApplied: number; // distinct categories applied to, 0–4
}

export type BadgeGroup =
  | "profile"
  | "applications"
  | "discovery"
  | "outcomes"
  | "community";

export type BadgeTier = "common" | "rare" | "elite";

export const BADGE_GROUP_LABEL: Record<BadgeGroup, string> = {
  profile: "Profile & résumé",
  applications: "Applications",
  discovery: "Discovery",
  outcomes: "Outcomes",
  community: "Community",
};

/** A boolean stat qualifies when true; a numeric stat when it reaches `gte`. */
interface BadgeCriterion {
  readonly stat: keyof SeekerBadgeStats;
  readonly gte: number;
}

export interface BadgeMeta {
  readonly label: string;
  readonly description: string;
  readonly icon: string;
  readonly group: BadgeGroup;
  readonly tier: BadgeTier;
  readonly criterion: BadgeCriterion;
}

export const BADGE_META: Record<BadgeKey, BadgeMeta> = {
  // ── Profile & résumé ─────────────────────────────────────────────────────
  [BADGE_KEYS.RESUME_STARTED]: {
    label: "First steps",
    description: "Started building your seeker profile.",
    icon: "nav.profile",
    group: "profile",
    tier: "common",
    criterion: { stat: "resumeCompletion", gte: 1 },
  },
  [BADGE_KEYS.BIO_ADDED]: {
    label: "Storyteller",
    description: "Wrote a bio so hosts know who they're meeting.",
    icon: "action.message",
    group: "profile",
    tier: "common",
    criterion: { stat: "hasBio", gte: 1 },
  },
  [BADGE_KEYS.PHOTO_ADDED]: {
    label: "Face forward",
    description: "Added a profile photo.",
    icon: "nav.photos",
    group: "profile",
    tier: "common",
    criterion: { stat: "hasPhoto", gte: 1 },
  },
  [BADGE_KEYS.SKILL_ADDED]: {
    label: "Skilled",
    description: "Listed your first skill.",
    icon: "profile.skills",
    group: "profile",
    tier: "common",
    criterion: { stat: "skillsCount", gte: 1 },
  },
  [BADGE_KEYS.SKILLS_5]: {
    label: "Multi-talented",
    description: "Listed five or more skills.",
    icon: "reaction.sparkle",
    group: "profile",
    tier: "rare",
    criterion: { stat: "skillsCount", gte: 5 },
  },
  [BADGE_KEYS.EXPERIENCE_ADDED]: {
    label: "Seasoned",
    description: "Added work experience to your résumé.",
    icon: "profile.experience",
    group: "profile",
    tier: "common",
    criterion: { stat: "experiencesCount", gte: 1 },
  },
  [BADGE_KEYS.EDUCATION_ADDED]: {
    label: "Scholar",
    description: "Added education to your résumé.",
    icon: "profile.resume",
    group: "profile",
    tier: "common",
    criterion: { stat: "educationsCount", gte: 1 },
  },
  [BADGE_KEYS.CERTIFICATIONS_ADDED]: {
    label: "Certified",
    description: "Added certifications to boost your match confidence.",
    icon: "profile.verification",
    group: "profile",
    tier: "rare",
    criterion: { stat: "certificationsCount", gte: 1 },
  },
  [BADGE_KEYS.RESUME_HALF]: {
    label: "Halfway there",
    description: "Reached 50% résumé completion.",
    icon: "analytics.meter",
    group: "profile",
    tier: "common",
    criterion: { stat: "resumeCompletion", gte: 50 },
  },
  [BADGE_KEYS.RESUME_COMPLETE]: {
    label: "Ready to roam",
    description: "Reached 80% résumé completion — ready to apply anywhere.",
    icon: "system.success",
    group: "profile",
    tier: "rare",
    criterion: { stat: "resumeCompletion", gte: 80 },
  },

  // ── Applications ─────────────────────────────────────────────────────────
  [BADGE_KEYS.FIRST_APPLICATION]: {
    label: "First cast",
    description: "Applied to your first opportunity.",
    icon: "action.apply",
    group: "applications",
    tier: "common",
    criterion: { stat: "appliedCount", gte: 1 },
  },
  [BADGE_KEYS.APPLY_5]: {
    label: "Go-getter",
    description: "Applied to five opportunities.",
    icon: "action.apply",
    group: "applications",
    tier: "common",
    criterion: { stat: "appliedCount", gte: 5 },
  },
  [BADGE_KEYS.APPLY_10]: {
    label: "Determined",
    description: "Applied to ten opportunities.",
    icon: "analytics.trend",
    group: "applications",
    tier: "rare",
    criterion: { stat: "appliedCount", gte: 10 },
  },
  [BADGE_KEYS.APPLY_25]: {
    label: "Relentless",
    description: "Applied to twenty-five opportunities.",
    icon: "analytics.trend",
    group: "applications",
    tier: "rare",
    criterion: { stat: "appliedCount", gte: 25 },
  },
  [BADGE_KEYS.APPLY_50]: {
    label: "Unstoppable",
    description: "Applied to fifty opportunities.",
    icon: "status.boosted",
    group: "applications",
    tier: "elite",
    criterion: { stat: "appliedCount", gte: 50 },
  },
  [BADGE_KEYS.WELL_ROUNDED]: {
    label: "Well-rounded",
    description: "Applied across all four lanes — farm, maritime, remote & seasonal.",
    icon: "category.mix",
    group: "applications",
    tier: "elite",
    criterion: { stat: "lanesApplied", gte: 4 },
  },

  // ── Discovery / saving ───────────────────────────────────────────────────
  [BADGE_KEYS.FIRST_SAVE]: {
    label: "Curator",
    description: "Saved your first opportunity.",
    icon: "action.save",
    group: "discovery",
    tier: "common",
    criterion: { stat: "savedCount", gte: 1 },
  },
  [BADGE_KEYS.SAVE_10]: {
    label: "Collector",
    description: "Saved ten opportunities.",
    icon: "nav.saved",
    group: "discovery",
    tier: "common",
    criterion: { stat: "savedCount", gte: 10 },
  },
  [BADGE_KEYS.SAVE_25]: {
    label: "Dreamer",
    description: "Saved twenty-five opportunities.",
    icon: "reaction.heart",
    group: "discovery",
    tier: "rare",
    criterion: { stat: "savedCount", gte: 25 },
  },
  [BADGE_KEYS.SAVE_50]: {
    label: "Visionary",
    description: "Saved fifty opportunities — big plans ahead.",
    icon: "reaction.hundred",
    group: "discovery",
    tier: "elite",
    criterion: { stat: "savedCount", gte: 50 },
  },

  // ── Outcomes ─────────────────────────────────────────────────────────────
  [BADGE_KEYS.FIRST_OFFER]: {
    label: "Wanted",
    description: "Received your first offer.",
    icon: "status.offered",
    group: "outcomes",
    tier: "rare",
    criterion: { stat: "offersCount", gte: 1 },
  },
  [BADGE_KEYS.OFFER_3]: {
    label: "In demand",
    description: "Received three offers.",
    icon: "status.offered",
    group: "outcomes",
    tier: "elite",
    criterion: { stat: "offersCount", gte: 3 },
  },
  [BADGE_KEYS.FIRST_ACCEPTED]: {
    label: "First accepted",
    description: "Your first application was accepted — adventure awaits.",
    icon: "status.match",
    group: "outcomes",
    tier: "rare",
    criterion: { stat: "acceptedCount", gte: 1 },
  },
  [BADGE_KEYS.TRAVELER_3]: {
    label: "Wanderer",
    description: "Three accepted roles — you're building a story.",
    icon: "mappin.cluster",
    group: "outcomes",
    tier: "rare",
    criterion: { stat: "acceptedCount", gte: 3 },
  },
  [BADGE_KEYS.TRAVELER_5]: {
    label: "Explorer",
    description: "Five accepted roles — true explorer status.",
    icon: "status.featured",
    group: "outcomes",
    tier: "elite",
    criterion: { stat: "acceptedCount", gte: 5 },
  },
  [BADGE_KEYS.TRAVELER_10]: {
    label: "Nomad",
    description: "Ten accepted roles — the road is home.",
    icon: "nav.map",
    group: "outcomes",
    tier: "elite",
    criterion: { stat: "acceptedCount", gte: 10 },
  },

  // ── Community / demand ───────────────────────────────────────────────────
  [BADGE_KEYS.FIRST_INVITE]: {
    label: "Recruited",
    description: "A host invited you to apply.",
    icon: "status.match",
    group: "community",
    tier: "rare",
    criterion: { stat: "invitesCount", gte: 1 },
  },
  [BADGE_KEYS.INVITE_5]: {
    label: "Sought-after",
    description: "Invited by five hosts.",
    icon: "reaction.sparkle",
    group: "community",
    tier: "elite",
    criterion: { stat: "invitesCount", gte: 5 },
  },
};

/** All badge keys in display order (the BADGE_META declaration order). */
export const ALL_BADGE_KEYS: readonly BadgeKey[] = Object.values(BADGE_KEYS);

/** True when the stats snapshot satisfies a badge's criterion. */
export function badgeQualifies(stats: SeekerBadgeStats, key: BadgeKey): boolean {
  const { stat, gte } = BADGE_META[key].criterion;
  const value = stats[stat];
  return typeof value === "boolean" ? value : value >= gte;
}

/** Every badge key the seeker currently qualifies for (earned + newly-earned). */
export function qualifyingBadges(stats: SeekerBadgeStats): BadgeKey[] {
  return ALL_BADGE_KEYS.filter((key) => badgeQualifies(stats, key));
}

/** 0–100 progress toward a badge (100 = earned). Booleans are 0 or 100. */
export function badgeProgress(stats: SeekerBadgeStats, key: BadgeKey): number {
  const { stat, gte } = BADGE_META[key].criterion;
  const value = stats[stat];
  if (typeof value === "boolean") return value ? 100 : 0;
  if (gte <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((value / gte) * 100)));
}
