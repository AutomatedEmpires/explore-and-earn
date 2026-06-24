import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { adminClient } from "../adminClient";

/**
 * Community "unread" badge state.
 *
 * The seeker shell shows a "N new" badge on the Community nav item. "New" =
 * community photos + active host announcements created since the seeker last
 * opened the community feed. Both the count and the mark-seen write go through
 * the service-role client, scoped by the caller's Clerk id — community_view_state
 * is RLS deny-by-default (migration 045) and carries nothing user-sensitive.
 */

// types.gen does not know community_view_state yet; use an untyped handle.
function admin(): SupabaseClient {
  return adminClient() as unknown as SupabaseClient;
}

/** Display cap — the badge shows "99+" beyond this. */
const UNREAD_CAP = 99;

/**
 * Number of community posts (photos + active announcements) created since the
 * seeker last opened the feed, capped at {@link UNREAD_CAP}. Returns 0 on any
 * failure or for a seeker who has never opened the community (no rows counted
 * past "now" default) — never throws, so the shell always renders.
 */
export async function getCommunityUnreadCount(
  clerkUserId: string,
): Promise<number> {
  try {
    const db = admin();

    const { data: state } = await db
      .from("community_view_state")
      .select("last_seen_at")
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle();
    const since = (state as { last_seen_at?: string | null } | null)?.last_seen_at ?? null;

    let photosQ = db
      .from("community_photos")
      .select("id", { count: "exact", head: true });
    let annsQ = db
      .from("host_announcements")
      .select("id", { count: "exact", head: true })
      .eq("status", "active");
    if (since) {
      photosQ = photosQ.gt("created_at", since);
      annsQ = annsQ.gt("created_at", since);
    }

    const [photos, anns] = await Promise.all([photosQ, annsQ]);
    const total = (photos.count ?? 0) + (anns.count ?? 0);
    return Math.min(Math.max(0, total), UNREAD_CAP);
  } catch {
    return 0;
  }
}

/**
 * Mark the community feed as seen now (upsert the seeker's last_seen_at). Called
 * when a seeker opens the community feed. Best-effort — never throws.
 */
export async function markCommunitySeen(clerkUserId: string): Promise<void> {
  try {
    await admin()
      .from("community_view_state")
      .upsert(
        { clerk_user_id: clerkUserId, last_seen_at: new Date().toISOString() },
        { onConflict: "clerk_user_id" },
      );
  } catch {
    // Best-effort: a failed mark-seen just means the badge clears on next visit.
  }
}
