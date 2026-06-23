import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AnnouncementKind,
  CommunityComment,
  CommunityPhoto,
  HostAnnouncement,
  ReactionCounts,
  ReactionKey,
} from "@explore-and-earn/contracts";
import { REACTION_KEYS, ZERO_REACTIONS } from "@explore-and-earn/contracts";

import { authedClient } from "../client";
import { adminClient } from "../adminClient";

export const COMMUNITY_PHOTOS_BUCKET = "community-photos";

// ─── Seeker helpers ───────────────────────────────────────────────────────────

export interface SeekerIdentity {
  readonly seekerProfileId: string;
  readonly completionScore: number;
}

export async function getSeekerCompletionScore(
  token: string,
  clerkUserId: string,
): Promise<SeekerIdentity | null> {
  const db = authedClient(token) as unknown as SupabaseClient;
  const { data, error } = await db
    .from("seeker_profiles")
    .select("id, completion_score")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (error) throw new Error(`getSeekerCompletionScore: ${error.message}`);
  if (!data) return null;
  return {
    seekerProfileId: data.id as string,
    completionScore: (data.completion_score as number) ?? 0,
  };
}

// ─── Host helpers ─────────────────────────────────────────────────────────────

export interface HostIdentity {
  readonly hostProfileId: string;
  readonly subscriptionTier: string;
}

export async function getHostTierAndProfile(
  token: string,
  clerkUserId: string,
): Promise<HostIdentity | null> {
  const db = authedClient(token) as unknown as SupabaseClient;
  const { data, error } = await db
    .from("host_profiles")
    .select("id, subscription_tier")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (error) throw new Error(`getHostTierAndProfile: ${error.message}`);
  if (!data) return null;
  return {
    hostProfileId: data.id as string,
    subscriptionTier: (data.subscription_tier as string) ?? "none",
  };
}

export async function countHostAnnouncementsThisMonth(
  token: string,
  hostProfileId: string,
): Promise<number> {
  const db = authedClient(token) as unknown as SupabaseClient;
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const { count, error } = await db
    .from("host_announcements")
    .select("id", { count: "exact", head: true })
    .eq("host_profile_id", hostProfileId)
    .in("status", ["active", "draft"])
    .gte("created_at", startOfMonth.toISOString());

  if (error) throw new Error(`countHostAnnouncementsThisMonth: ${error.message}`);
  return count ?? 0;
}

// ─── Feed queries ─────────────────────────────────────────────────────────────

export async function getFeedPhotos(
  token: string,
  cursor?: string,
): Promise<CommunityPhoto[]> {
  const db = authedClient(token) as unknown as SupabaseClient;

  let query = (db as unknown as SupabaseClient)
    .from("community_photos")
    .select("id, seeker_profile_id, storage_path, caption, location_tag, created_at, seeker_profiles(display_name)")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(20);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data, error } = await query;
  if (error) throw new Error(`getFeedPhotos: ${error.message}`);
  if (!data) return [];

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  return data.map((row: Record<string, unknown>) => {
    const profile = row.seeker_profiles as Record<string, unknown> | null;
    const storagePath = row.storage_path as string;
    return {
      id: row.id as string,
      seekerProfileId: row.seeker_profile_id as string,
      authorName: (profile?.display_name as string | null) ?? "Community Member",
      storageUrl: `${supabaseUrl}/storage/v1/object/public/${COMMUNITY_PHOTOS_BUCKET}/${storagePath}`,
      caption: (row.caption as string | null) ?? null,
      locationTag: (row.location_tag as string | null) ?? null,
      createdAt: row.created_at as string,
    };
  });
}

export async function getFeedAnnouncements(
  token: string,
): Promise<HostAnnouncement[]> {
  const db = authedClient(token) as unknown as SupabaseClient;
  const now = new Date().toISOString();

  const { data, error } = await db
    .from("host_announcements")
    .select("id, host_profile_id, title, body, kind, expires_at, created_at, stripe_payment_intent_id, host_profiles(company_name)")
    .eq("status", "active")
    .gt("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(`getFeedAnnouncements: ${error.message}`);
  if (!data) return [];

  return data.map((row: Record<string, unknown>) => {
    const profile = row.host_profiles as Record<string, unknown> | null;
    return {
      id: row.id as string,
      hostProfileId: row.host_profile_id as string,
      hostName: (profile?.company_name as string | null) ?? "Host",
      title: row.title as string,
      body: row.body as string,
      kind: (row.kind as AnnouncementKind) ?? "general",
      expiresAt: row.expires_at as string,
      createdAt: row.created_at as string,
      isPurchased: Boolean(row.stripe_payment_intent_id),
    };
  });
}

export async function getLatestDraftAnnouncement(
  token: string,
  hostProfileId: string,
): Promise<string | null> {
  const db = authedClient(token) as unknown as SupabaseClient;
  const { data, error } = await db
    .from("host_announcements")
    .select("id")
    .eq("host_profile_id", hostProfileId)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getLatestDraftAnnouncement: ${error.message}`);
  return data ? (data.id as string) : null;
}

// ─── Write helpers (admin client — bypasses RLS for server-only operations) ──

export interface InsertCommunityPhotoParams {
  readonly seekerProfileId: string;
  readonly storagePath: string;
  readonly caption: string | null;
  readonly locationTag: string | null;
}

export async function insertCommunityPhoto(
  params: InsertCommunityPhotoParams,
): Promise<{ id: string }> {
  const admin = adminClient() as unknown as SupabaseClient;
  const { data, error } = await admin
    .from("community_photos")
    .insert({
      seeker_profile_id: params.seekerProfileId,
      storage_path:      params.storagePath,
      caption:           params.caption,
      location_tag:      params.locationTag,
      status:            "active",
    })
    .select("id")
    .single();
  if (error) throw new Error(`insertCommunityPhoto: ${error.message}`);
  return { id: data.id as string };
}

export async function deleteCommunityPhoto(photoId: string): Promise<void> {
  const admin = adminClient() as unknown as SupabaseClient;
  const { error } = await admin
    .from("community_photos")
    .update({ status: "removed", updated_at: new Date().toISOString() })
    .eq("id", photoId);
  if (error) throw new Error(`deleteCommunityPhoto: ${error.message}`);
}

export interface InsertHostAnnouncementParams {
  readonly hostProfileId: string;
  readonly title: string;
  readonly body: string;
  readonly kind: AnnouncementKind;
  readonly expiresAt: string;
  readonly status: "draft" | "active";
  readonly stripePaymentIntentId?: string | null;
  readonly purchaseDurationDays?: number | null;
  readonly purchaseAmountCents?: number | null;
}

export async function insertHostAnnouncement(
  params: InsertHostAnnouncementParams,
): Promise<{ id: string }> {
  const admin = adminClient() as unknown as SupabaseClient;
  const { data, error } = await admin
    .from("host_announcements")
    .insert({
      host_profile_id:          params.hostProfileId,
      title:                    params.title,
      body:                     params.body,
      kind:                     params.kind,
      expires_at:               params.expiresAt,
      status:                   params.status,
      stripe_payment_intent_id: params.stripePaymentIntentId ?? null,
      purchase_duration_days:   params.purchaseDurationDays ?? null,
      purchase_amount_cents:    params.purchaseAmountCents ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`insertHostAnnouncement: ${error.message}`);
  return { id: data.id as string };
}

export interface ActivateAnnouncementParams {
  readonly title: string;
  readonly body: string;
  readonly kind: AnnouncementKind;
}

export async function activateHostAnnouncement(
  draftId: string,
  hostProfileId: string,
  params: ActivateAnnouncementParams,
): Promise<void> {
  const admin = adminClient() as unknown as SupabaseClient;
  const { error } = await admin
    .from("host_announcements")
    .update({
      title:      params.title,
      body:       params.body,
      kind:       params.kind,
      status:     "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", draftId)
    .eq("host_profile_id", hostProfileId)
    .eq("status", "draft");
  if (error) throw new Error(`activateHostAnnouncement: ${error.message}`);
}

export async function getOwnedPhotoPath(
  seekerProfileId: string,
  photoId: string,
): Promise<string | null> {
  const admin = adminClient() as unknown as SupabaseClient;
  const { data, error } = await admin
    .from("community_photos")
    .select("storage_path")
    .eq("id", photoId)
    .eq("seeker_profile_id", seekerProfileId)
    .maybeSingle();
  if (error) throw new Error(`getOwnedPhotoPath: ${error.message}`);
  return data ? (data.storage_path as string) : null;
}

// ─── Reactions — toggle ───────────────────────────────────────────────────────

/**
 * Best-effort: tell a community photo's owner that a fellow seeker reacted.
 *
 * This is a cross-user write (the reactor creates a row the owner reads), so it
 * goes through the service-role `admin` client. It is coalesced by `dedupe_key`
 * — one notification per (photo, reactor) for all time — so repeated
 * react/un-react cycles never spam the owner, and it never fires for a
 * self-reaction. It NEVER throws: a notification failure must not break the
 * reaction itself, which is the user's primary action.
 */
async function notifyPhotoReaction(
  admin: SupabaseClient,
  photoId: string,
  reactorClerkUserId: string,
): Promise<void> {
  try {
    const { data: photo } = await admin
      .from("community_photos")
      .select("caption, seeker_profiles(clerk_user_id)")
      .eq("id", photoId)
      .maybeSingle();
    if (!photo) return;

    // PostgREST types a to-one embed as an array; normalize array-or-object.
    const row = photo as unknown as {
      caption?: string | null;
      seeker_profiles?: unknown;
    };
    const rel = row.seeker_profiles;
    const owner = (Array.isArray(rel) ? rel[0] : rel) as
      | { clerk_user_id?: string | null }
      | null
      | undefined;
    const ownerClerkId = owner?.clerk_user_id ?? null;
    // No resolvable recipient, or a seeker reacting to their own photo.
    if (!ownerClerkId || ownerClerkId === reactorClerkUserId) return;

    const { data: reactor } = await admin
      .from("seeker_profiles")
      .select("display_name")
      .eq("clerk_user_id", reactorClerkUserId)
      .maybeSingle();
    const reactorName =
      (reactor?.display_name as string | null)?.trim() || "A fellow seeker";
    const caption = row.caption ?? null;

    await admin.from("notifications").insert({
      recipient_user_id: null,
      recipient_clerk_user_id: ownerClerkId,
      category: "community",
      priority: "informational",
      channel: "in_app",
      title: `${reactorName} reacted to your photo`,
      body: caption
        ? `Your photo “${caption}” picked up a new reaction in the community.`
        : "Your community photo picked up a new reaction.",
      subject_type: "community_photo",
      subject_id: photoId,
      action_url: "/community/photos",
      // The unique dedupe index swallows repeat react/un-react cycles, so the
      // owner gets exactly one reaction notification per fellow seeker, ever.
      dedupe_key: `photo_reaction:${photoId}:${reactorClerkUserId}`,
    });
  } catch {
    // Best-effort only — swallow so the reaction always succeeds.
  }
}

export async function togglePhotoReaction(
  clerkUserId: string,
  photoId: string,
  reaction: ReactionKey,
): Promise<{ added: boolean }> {
  const admin = adminClient() as unknown as SupabaseClient;
  const { error } = await admin.from("community_photo_reactions").insert({
    photo_id:      photoId,
    clerk_user_id: clerkUserId,
    reaction,
  });
  if (!error) {
    // Fire the owner notification on a fresh reaction (best-effort, never throws).
    await notifyPhotoReaction(admin, photoId, clerkUserId);
    return { added: true };
  }
  if (error.code === "23505") {
    await admin.from("community_photo_reactions").delete()
      .eq("photo_id",      photoId)
      .eq("clerk_user_id", clerkUserId)
      .eq("reaction",      reaction);
    return { added: false };
  }
  throw new Error(`togglePhotoReaction: ${error.message}`);
}

/**
 * Best-effort: tell a host that a seeker reacted to their announcement. Mirrors
 * {@link notifyPhotoReaction} — service-role write, coalesced by dedupe_key, no
 * self-reaction, never throws.
 */
async function notifyAnnouncementReaction(
  admin: SupabaseClient,
  announcementId: string,
  reactorClerkUserId: string,
): Promise<void> {
  try {
    const { data: ann } = await admin
      .from("host_announcements")
      .select("title, host_profiles(clerk_user_id)")
      .eq("id", announcementId)
      .maybeSingle();
    if (!ann) return;

    // PostgREST types a to-one embed as an array; normalize array-or-object.
    const row = ann as unknown as {
      title?: string | null;
      host_profiles?: unknown;
    };
    const rel = row.host_profiles;
    const owner = (Array.isArray(rel) ? rel[0] : rel) as
      | { clerk_user_id?: string | null }
      | null
      | undefined;
    const ownerClerkId = owner?.clerk_user_id ?? null;
    if (!ownerClerkId || ownerClerkId === reactorClerkUserId) return;

    const { data: reactor } = await admin
      .from("seeker_profiles")
      .select("display_name")
      .eq("clerk_user_id", reactorClerkUserId)
      .maybeSingle();
    const reactorName =
      (reactor?.display_name as string | null)?.trim() || "A seeker";
    const title = row.title ?? null;

    await admin.from("notifications").insert({
      recipient_user_id: null,
      recipient_clerk_user_id: ownerClerkId,
      category: "community",
      priority: "informational",
      channel: "in_app",
      title: `${reactorName} reacted to your announcement`,
      body: title
        ? `Your announcement “${title}” is resonating with seekers.`
        : "Your community announcement is resonating with seekers.",
      subject_type: "host_announcement",
      subject_id: announcementId,
      action_url: "/community/announcements",
      dedupe_key: `ann_reaction:${announcementId}:${reactorClerkUserId}`,
    });
  } catch {
    // Best-effort only — swallow so the reaction always succeeds.
  }
}

export async function toggleAnnouncementReaction(
  clerkUserId: string,
  announcementId: string,
  reaction: ReactionKey,
): Promise<{ added: boolean }> {
  const admin = adminClient() as unknown as SupabaseClient;
  const { error } = await admin.from("community_announcement_reactions").insert({
    announcement_id: announcementId,
    clerk_user_id:   clerkUserId,
    reaction,
  });
  if (!error) {
    await notifyAnnouncementReaction(admin, announcementId, clerkUserId);
    return { added: true };
  }
  if (error.code === "23505") {
    await admin.from("community_announcement_reactions").delete()
      .eq("announcement_id", announcementId)
      .eq("clerk_user_id",   clerkUserId)
      .eq("reaction",        reaction);
    return { added: false };
  }
  throw new Error(`toggleAnnouncementReaction: ${error.message}`);
}

// ─── Reactions — batch counts ─────────────────────────────────────────────────

function aggregateReactions(
  rows: Array<{ photo_id?: string; announcement_id?: string; reaction: string; clerk_user_id: string }>,
  idField: "photo_id" | "announcement_id",
  targetIds: string[],
  currentClerkUserId?: string,
): Map<string, ReactionCounts> {
  const map = new Map<string, ReactionCounts>(
    targetIds.map(id => [id, { ...ZERO_REACTIONS, userReactions: [] }]),
  );

  for (const row of rows) {
    const targetId = (row[idField] as string | undefined) ?? "";
    const reaction = row.reaction as ReactionKey;
    if (!REACTION_KEYS.includes(reaction)) continue;
    const existing = map.get(targetId);
    if (!existing) continue;
    const newCount = (existing[reaction] as number) + 1;
    const userReactions =
      currentClerkUserId && row.clerk_user_id === currentClerkUserId
        ? ([...existing.userReactions, reaction] as ReactionKey[])
        : (existing.userReactions as ReactionKey[]);
    map.set(targetId, { ...existing, [reaction]: newCount, userReactions });
  }

  return map;
}

export async function getPhotoReactionsBatch(
  photoIds: string[],
  currentClerkUserId?: string,
): Promise<Map<string, ReactionCounts>> {
  if (!photoIds.length) return new Map();
  const admin = adminClient() as unknown as SupabaseClient;
  const { data, error } = await admin
    .from("community_photo_reactions")
    .select("photo_id, reaction, clerk_user_id")
    .in("photo_id", photoIds);
  if (error) throw new Error(`getPhotoReactionsBatch: ${error.message}`);
  return aggregateReactions(
    (data ?? []) as Array<{ photo_id: string; reaction: string; clerk_user_id: string }>,
    "photo_id",
    photoIds,
    currentClerkUserId,
  );
}

export async function getAnnouncementReactionsBatch(
  announcementIds: string[],
  currentClerkUserId?: string,
): Promise<Map<string, ReactionCounts>> {
  if (!announcementIds.length) return new Map();
  const admin = adminClient() as unknown as SupabaseClient;
  const { data, error } = await admin
    .from("community_announcement_reactions")
    .select("announcement_id, reaction, clerk_user_id")
    .in("announcement_id", announcementIds);
  if (error) throw new Error(`getAnnouncementReactionsBatch: ${error.message}`);
  return aggregateReactions(
    (data ?? []) as Array<{ announcement_id: string; reaction: string; clerk_user_id: string }>,
    "announcement_id",
    announcementIds,
    currentClerkUserId,
  );
}

// ─── Comments ─────────────────────────────────────────────────────────────────

export async function getComments(
  token: string,
  targetType: "photo" | "announcement",
  targetId: string,
): Promise<CommunityComment[]> {
  const db = authedClient(token) as unknown as SupabaseClient;
  const { data, error } = await db
    .from("community_comments")
    .select("id, target_type, target_id, clerk_user_id, author_name, body, created_at")
    .eq("target_type", targetType)
    .eq("target_id",   targetId)
    .eq("status",      "active")
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw new Error(`getComments: ${error.message}`);
  return (data ?? []).map((row: Record<string, unknown>): CommunityComment => ({
    id:          row.id as string,
    targetType:  row.target_type as "photo" | "announcement",
    targetId:    row.target_id as string,
    clerkUserId: row.clerk_user_id as string,
    authorName:  row.author_name as string,
    body:        row.body as string,
    createdAt:   row.created_at as string,
  }));
}

export async function insertComment(
  clerkUserId: string,
  authorName: string,
  targetType: "photo" | "announcement",
  targetId: string,
  body: string,
): Promise<CommunityComment> {
  const admin = adminClient() as unknown as SupabaseClient;
  const { data, error } = await admin
    .from("community_comments")
    .insert({
      target_type:   targetType,
      target_id:     targetId,
      clerk_user_id: clerkUserId,
      author_name:   authorName,
      body,
      status:        "active",
    })
    .select("id, target_type, target_id, clerk_user_id, author_name, body, created_at")
    .single();
  if (error) throw new Error(`insertComment: ${error.message}`);
  return {
    id:          data.id as string,
    targetType:  data.target_type as "photo" | "announcement",
    targetId:    data.target_id as string,
    clerkUserId: data.clerk_user_id as string,
    authorName:  data.author_name as string,
    body:        data.body as string,
    createdAt:   data.created_at as string,
  };
}

export async function softDeleteComment(
  commentId: string,
  clerkUserId: string,
): Promise<void> {
  const admin = adminClient() as unknown as SupabaseClient;
  const { error } = await admin
    .from("community_comments")
    .update({ status: "removed" })
    .eq("id",            commentId)
    .eq("clerk_user_id", clerkUserId);
  if (error) throw new Error(`softDeleteComment: ${error.message}`);
}

export async function getCommenterName(
  token: string,
  clerkUserId: string,
): Promise<string> {
  const db = authedClient(token) as unknown as SupabaseClient;

  const { data: seeker } = await db
    .from("seeker_profiles")
    .select("display_name")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (seeker?.display_name) return seeker.display_name as string;

  const { data: host } = await db
    .from("host_profiles")
    .select("company_name")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  return (host?.company_name as string | null) ?? "Community Member";
}
