import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { authedClient } from "../client";

/**
 * Seeker badges — milestone achievement system.
 *
 * Badge keys are app-defined string constants defined in BADGE_KEYS below.
 * Badges are awarded once per seeker; duplicate inserts are silently ignored
 * via the unique constraint on (seeker_profile_id, badge_key).
 *
 * RLS: seekers can read their own badges. Writes use the authed client
 * (seeker token), relying on the upsert's conflict-do-nothing behavior.
 * The service-role path is not needed for award logic because we always
 * award in the context of an authenticated server action.
 */

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

export const BADGE_META: Record<BadgeKey, { readonly label: string; readonly description: string; readonly icon: string }> = {
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

function untypedClient(clerkToken: string): SupabaseClient {
  return authedClient(clerkToken) as unknown as SupabaseClient;
}

async function resolveSeekerId(
  db: SupabaseClient,
  clerkUserId: string,
): Promise<string | null> {
  const { data } = await db
    .from("seeker_profiles")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  return String((data as Record<string, unknown>).id);
}

export async function getSeekerBadges(
  clerkToken: string,
  clerkUserId: string,
): Promise<SeekerBadge[]> {
  const db = untypedClient(clerkToken);
  const seekerProfileId = await resolveSeekerId(db, clerkUserId);
  if (!seekerProfileId) return [];

  const { data, error } = await db
    .from("seeker_badges")
    .select("id, badge_key, awarded_at, metadata")
    .eq("seeker_profile_id", seekerProfileId)
    .order("awarded_at", { ascending: true });

  if (error) return [];

  const knownKeys = new Set<string>(Object.values(BADGE_KEYS));
  return ((data ?? []) as ReadonlyArray<Record<string, unknown>>)
    .filter((row) => knownKeys.has(String(row.badge_key)))
    .map((row) => ({
      id: String(row.id),
      badgeKey: String(row.badge_key) as BadgeKey,
      awardedAt: String(row.awarded_at),
      metadata: row.metadata != null ? (row.metadata as Record<string, unknown>) : null,
    }));
}

/**
 * Award a badge to the authed seeker. Silently succeeds if already awarded
 * (unique constraint conflict is ignored). Returns ok=true in both cases.
 */
export async function awardSeekerBadge(
  clerkToken: string,
  clerkUserId: string,
  badgeKey: BadgeKey,
  metadata?: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const db = untypedClient(clerkToken);
  const seekerProfileId = await resolveSeekerId(db, clerkUserId);
  if (!seekerProfileId) return { ok: false, error: "seeker_profile_not_found" };

  const { error } = await db
    .from("seeker_badges")
    .upsert(
      {
        seeker_profile_id: seekerProfileId,
        badge_key: badgeKey,
        metadata: metadata ?? null,
      },
      { onConflict: "seeker_profile_id,badge_key", ignoreDuplicates: true },
    );

  return error ? { ok: false, error: error.message } : { ok: true };
}
