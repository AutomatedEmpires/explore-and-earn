import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { BADGE_KEYS, type BadgeKey, type SeekerBadge } from "@explore-and-earn/contracts";
import { authedClient } from "../client";
import { adminClient } from "../adminClient";

export {
  ALL_BADGE_KEYS,
  BADGE_GROUP_LABEL,
  BADGE_KEYS,
  BADGE_META,
  badgeProgress,
  badgeQualifies,
  qualifyingBadges,
  type BadgeGroup,
  type BadgeKey,
  type BadgeMeta,
  type BadgeTier,
  type SeekerBadge,
  type SeekerBadgeStats,
} from "@explore-and-earn/contracts";

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

/**
 * Resolve a seeker profile id from a Clerk user id using the SERVICE-ROLE client.
 * Used by the badge reconciler (writes to seeker_badges are service-role only per
 * the migration-030 RLS), so it must not depend on the seeker's own token.
 */
export async function resolveSeekerProfileIdAdmin(
  clerkUserId: string,
): Promise<string | null> {
  const db = adminClient() as unknown as SupabaseClient;
  const { data } = await db
    .from("seeker_profiles")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .is("deleted_at", null)
    .maybeSingle();
  return data ? String((data as Record<string, unknown>).id) : null;
}

/**
 * Award a set of badges to a seeker (SERVICE-ROLE write; idempotent). Unknown
 * keys are dropped; existing rows are left untouched via the unique-constraint
 * upsert. Returns how many rows were newly inserted.
 */
export async function awardSeekerBadgesAdmin(
  seekerProfileId: string,
  badgeKeys: readonly BadgeKey[],
): Promise<{ ok: boolean; inserted: number; error?: string }> {
  const known = new Set<string>(Object.values(BADGE_KEYS));
  const rows = badgeKeys
    .filter((k) => known.has(k))
    .map((badge_key) => ({ seeker_profile_id: seekerProfileId, badge_key, metadata: null }));
  if (rows.length === 0) return { ok: true, inserted: 0 };

  const db = adminClient() as unknown as SupabaseClient;
  const { data, error } = await db
    .from("seeker_badges")
    .upsert(rows, { onConflict: "seeker_profile_id,badge_key", ignoreDuplicates: true })
    .select("badge_key");

  if (error) return { ok: false, inserted: 0, error: error.message };
  return { ok: true, inserted: (data ?? []).length };
}

/**
 * Set (or clear, with null) the seeker's FEATURED badge — the one highlighted on
 * their public profile. Stored as `metadata.featured=true` on the chosen
 * seeker_badges row (no schema change needed), so at most one is featured. The
 * reconciler's ignoreDuplicates upsert never clobbers it. Service-role write.
 * The caller MUST verify the badge is earned before featuring it.
 */
export async function setSeekerFeaturedBadgeAdmin(
  seekerProfileId: string,
  badgeKey: BadgeKey | null,
): Promise<{ ok: boolean; error?: string }> {
  const db = adminClient() as unknown as SupabaseClient;

  // Clear any existing featured flag (badges carry no other metadata today).
  const { error: clearError } = await db
    .from("seeker_badges")
    .update({ metadata: null })
    .eq("seeker_profile_id", seekerProfileId);
  if (clearError) return { ok: false, error: clearError.message };

  if (!badgeKey) return { ok: true };

  const { error: setError } = await db
    .from("seeker_badges")
    .update({ metadata: { featured: true } })
    .eq("seeker_profile_id", seekerProfileId)
    .eq("badge_key", badgeKey);
  return setError ? { ok: false, error: setError.message } : { ok: true };
}
