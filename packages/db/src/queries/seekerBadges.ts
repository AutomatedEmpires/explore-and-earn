import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { BADGE_KEYS, type BadgeKey, type SeekerBadge } from "@explore-and-earn/contracts";
import { authedClient } from "../client";

export { BADGE_KEYS, BADGE_META, type BadgeKey, type SeekerBadge } from "@explore-and-earn/contracts";

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
