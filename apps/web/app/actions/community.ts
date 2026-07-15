"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import { checkRateLimit } from "../../lib/rateLimit";

import {
  ANNOUNCEMENT_FREE_DURATION_DAYS,
  ANNOUNCEMENT_MONTHLY_QUOTA,
  type AnnouncementKind,
} from "@explore-and-earn/contracts";
import {
  activateHostAnnouncement,
  countHostAnnouncementsThisMonth,
  deleteCommunityPhoto,
  getComments,
  getCommenterName,
  getSeekerCompletionScore,
  getHostTierAndProfile,
  getOwnedPhotoPath,
  insertComment,
  insertCommunityPhoto,
  insertHostAnnouncement,
  softDeleteComment,
  toggleAnnouncementReaction,
  togglePhotoReaction,
} from "@explore-and-earn/db";
import {
  deleteStorageObject,
  uploadCommunityPhotoStorage,
} from "@explore-and-earn/db";

import { createAnnouncementCheckoutSession } from "../../services/stripe";

const COMMUNITY_PATH = "/community";
const COMMUNITY_PHOTOS_BUCKET = "community-photos";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/webp", "image/png"]);
const MAX_FILE_BYTES = 10 * 1024 * 1024;

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function resolveAuth() {
  const { userId, getToken } = await auth();
  if (!userId) return null;
  const token = await getToken({ template: "supabase" });
  if (!token) return null;
  return { userId, token };
}

// ─── Photo upload ─────────────────────────────────────────────────────────────

export type UploadPhotoResult =
  | { ok: true; photoId: string }
  | { ok: false; reason: "unauthenticated" | "not_seeker" | "incomplete_profile" | "invalid_file" | "upload_failed"; score?: number };

export async function uploadCommunityPhotoAction(fd: FormData): Promise<UploadPhotoResult> {
  const session = await resolveAuth();
  if (!session) return { ok: false, reason: "unauthenticated" };
  // Service-role writes get no RLS backstop — rate limits are the guard.
  if (!checkRateLimit(`community-photo:${session.userId}`, 10, 60 * 60 * 1000).allowed) {
    return { ok: false, reason: "upload_failed" };
  }

  const identity = await getSeekerCompletionScore(session.token, session.userId);
  if (!identity) return { ok: false, reason: "not_seeker" };
  if (identity.completionScore < 80) {
    return { ok: false, reason: "incomplete_profile", score: identity.completionScore };
  }

  const file = fd.get("photo");
  if (!(file instanceof File)) return { ok: false, reason: "invalid_file" };
  if (!ALLOWED_MIME_TYPES.has(file.type)) return { ok: false, reason: "invalid_file" };
  if (file.size > MAX_FILE_BYTES) return { ok: false, reason: "invalid_file" };

  const ext = file.type === "image/webp" ? "webp" : file.type === "image/png" ? "png" : "jpg";
  const filename = `${crypto.randomUUID()}.${ext}`;
  const caption = (fd.get("caption") as string | null)?.trim().slice(0, 280) || null;
  const locationTag = (fd.get("location_tag") as string | null)?.trim().slice(0, 100) || null;

  let storagePath: string;
  try {
    storagePath = await uploadCommunityPhotoStorage(
      session.token,
      identity.seekerProfileId,
      filename,
      file,
    );
  } catch {
    return { ok: false, reason: "upload_failed" };
  }

  const { id: photoId } = await insertCommunityPhoto({
    seekerProfileId: identity.seekerProfileId,
    storagePath,
    caption,
    locationTag,
  });

  revalidatePath(COMMUNITY_PATH);
  return { ok: true, photoId };
}

// ─── Photo delete ─────────────────────────────────────────────────────────────

export type DeletePhotoResult =
  | { ok: true }
  | { ok: false; reason: "unauthenticated" | "not_seeker" | "not_found" };

export async function deleteCommunityPhotoAction(photoId: string): Promise<DeletePhotoResult> {
  const session = await resolveAuth();
  if (!session) return { ok: false, reason: "unauthenticated" };

  const identity = await getSeekerCompletionScore(session.token, session.userId);
  if (!identity) return { ok: false, reason: "not_seeker" };

  const storagePath = await getOwnedPhotoPath(identity.seekerProfileId, photoId);
  if (!storagePath) return { ok: false, reason: "not_found" };

  await deleteCommunityPhoto(photoId);
  await deleteStorageObject(session.token, COMMUNITY_PHOTOS_BUCKET, storagePath);

  revalidatePath(COMMUNITY_PATH);
  return { ok: true };
}

// ─── Post free announcement ───────────────────────────────────────────────────

export type PostAnnouncementResult =
  | { ok: true; announcementId: string }
  | { ok: false; reason: "unauthenticated" | "not_host" | "quota_exceeded" | "invalid_input"; purchaseRequired?: boolean };

export async function postHostAnnouncementAction(fd: FormData): Promise<PostAnnouncementResult> {
  const session = await resolveAuth();
  if (!session) return { ok: false, reason: "unauthenticated" };

  const host = await getHostTierAndProfile(session.token, session.userId);
  if (!host) return { ok: false, reason: "not_host" };

  const quota = ANNOUNCEMENT_MONTHLY_QUOTA[host.subscriptionTier] ?? 0;
  if (quota === 0) {
    return { ok: false, reason: "quota_exceeded", purchaseRequired: true };
  }

  const count = await countHostAnnouncementsThisMonth(session.token, host.hostProfileId);
  if (count >= quota) {
    return { ok: false, reason: "quota_exceeded", purchaseRequired: true };
  }

  const title = (fd.get("title") as string | null)?.trim().slice(0, 80);
  const body  = (fd.get("body")  as string | null)?.trim().slice(0, 500);
  const kind  = fd.get("kind") as string | null;

  if (!title || !body || !kind || !["general", "hiring", "event"].includes(kind)) {
    return { ok: false, reason: "invalid_input" };
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + ANNOUNCEMENT_FREE_DURATION_DAYS);

  const { id: announcementId } = await insertHostAnnouncement({
    hostProfileId: host.hostProfileId,
    title,
    body,
    kind: kind as AnnouncementKind,
    expiresAt: expiresAt.toISOString(),
    status: "active",
  });

  revalidatePath(COMMUNITY_PATH);
  return { ok: true, announcementId };
}

// ─── Activate purchased draft ─────────────────────────────────────────────────

export type ActivateDraftResult =
  | { ok: true }
  | { ok: false; reason: "unauthenticated" | "not_host" | "not_found" | "already_active" | "invalid_input" };

export async function activateDraftAnnouncementAction(
  draftId: string,
  fd: FormData,
): Promise<ActivateDraftResult> {
  const session = await resolveAuth();
  if (!session) return { ok: false, reason: "unauthenticated" };

  const host = await getHostTierAndProfile(session.token, session.userId);
  if (!host) return { ok: false, reason: "not_host" };

  const title = (fd.get("title") as string | null)?.trim().slice(0, 80);
  const body  = (fd.get("body")  as string | null)?.trim().slice(0, 500);
  const kind  = fd.get("kind") as string | null;

  if (!title || !body || !kind || !["general", "hiring", "event"].includes(kind)) {
    return { ok: false, reason: "invalid_input" };
  }

  try {
    await activateHostAnnouncement(draftId, host.hostProfileId, {
      title,
      body,
      kind: kind as AnnouncementKind,
    });
  } catch {
    return { ok: false, reason: "not_found" };
  }

  revalidatePath(COMMUNITY_PATH);
  return { ok: true };
}

// ─── Create Stripe checkout ───────────────────────────────────────────────────

export type AnnouncementCheckoutResult =
  | { ok: true; sessionUrl: string }
  | { ok: false; reason: "unauthenticated" | "not_host" | "checkout_failed" | "no_stripe_config" };

export async function createAnnouncementCheckoutAction(): Promise<AnnouncementCheckoutResult> {
  if (!hasAnnouncementPriceConfig()) {
    return { ok: false, reason: "no_stripe_config" };
  }

  const session = await resolveAuth();
  if (!session) return { ok: false, reason: "unauthenticated" };
  // Each call mints a Stripe Checkout Session — cap the mint rate.
  if (!checkRateLimit(`announce-checkout:${session.userId}`, 5, 60 * 60 * 1000).allowed) {
    return { ok: false, reason: "checkout_failed" };
  }

  const host = await getHostTierAndProfile(session.token, session.userId);
  if (!host) return { ok: false, reason: "not_host" };

  try {
    const checkout = await createAnnouncementCheckoutSession({
      clerkUserId: session.userId,
      hostProfileId: host.hostProfileId,
    });
    const url = checkout.url;
    if (!url) return { ok: false, reason: "checkout_failed" };
    return { ok: true, sessionUrl: url };
  } catch {
    return { ok: false, reason: "checkout_failed" };
  }
}

function hasAnnouncementPriceConfig(): boolean {
  return (
    Boolean(process.env.STRIPE_PRICE_ANNOUNCEMENT) &&
    Boolean(process.env.STRIPE_SECRET_KEY)
  );
}

// ─── Reaction toggle ──────────────────────────────────────────────────────────

export type ToggleReactionResult =
  | { ok: true; added: boolean }
  | { ok: false; reason: "unauthenticated" | "toggle_failed" };

export async function toggleReactionAction(
  targetType: "photo" | "announcement",
  targetId: string,
  reaction: string,
): Promise<ToggleReactionResult> {
  const session = await resolveAuth();
  if (!session) return { ok: false, reason: "unauthenticated" };
  if (!checkRateLimit(`community-react:${session.userId}`, 60, 5 * 60 * 1000).allowed) {
    return { ok: false, reason: "toggle_failed" };
  }

  const VALID: readonly string[] = ["smile", "heart", "hundred", "clap", "sparkle"];
  if (!VALID.includes(reaction)) return { ok: false, reason: "toggle_failed" };

  try {
    const result = targetType === "photo"
      ? await togglePhotoReaction(session.userId, targetId, reaction as import("@explore-and-earn/contracts").ReactionKey)
      : await toggleAnnouncementReaction(session.userId, targetId, reaction as import("@explore-and-earn/contracts").ReactionKey);
    return { ok: true, added: result.added };
  } catch {
    return { ok: false, reason: "toggle_failed" };
  }
}

// ─── Comments ─────────────────────────────────────────────────────────────────

export type GetCommentsResult =
  | { ok: true; comments: import("@explore-and-earn/contracts").CommunityComment[] }
  | { ok: false; reason: "unauthenticated" | "fetch_failed" };

export async function getCommentsAction(
  targetType: "photo" | "announcement",
  targetId: string,
): Promise<GetCommentsResult> {
  const session = await resolveAuth();
  if (!session) return { ok: false, reason: "unauthenticated" };
  try {
    const comments = await getComments(session.token, targetType, targetId);
    return { ok: true, comments };
  } catch {
    return { ok: false, reason: "fetch_failed" };
  }
}

export type AddCommentResult =
  | { ok: true; comment: import("@explore-and-earn/contracts").CommunityComment }
  | { ok: false; reason: "unauthenticated" | "invalid_input" | "insert_failed" };

export async function addCommentAction(fd: FormData): Promise<AddCommentResult> {
  const session = await resolveAuth();
  if (!session) return { ok: false, reason: "unauthenticated" };
  if (!checkRateLimit(`community-comment:${session.userId}`, 20, 5 * 60 * 1000).allowed) {
    return { ok: false, reason: "insert_failed" };
  }

  const targetType = fd.get("targetType") as string | null;
  const targetId   = fd.get("targetId")   as string | null;
  const body       = (fd.get("body") as string | null)?.trim().slice(0, 500);

  if (
    !body ||
    !targetId ||
    (targetType !== "photo" && targetType !== "announcement")
  ) {
    return { ok: false, reason: "invalid_input" };
  }

  try {
    const authorName = await getCommenterName(session.token, session.userId);
    const comment = await insertComment(
      session.userId,
      authorName,
      targetType,
      targetId,
      body,
    );
    revalidatePath(COMMUNITY_PATH);
    return { ok: true, comment };
  } catch {
    return { ok: false, reason: "insert_failed" };
  }
}

export type RemoveCommentResult =
  | { ok: true }
  | { ok: false; reason: "unauthenticated" | "remove_failed" };

export async function removeCommentAction(commentId: string): Promise<RemoveCommentResult> {
  const session = await resolveAuth();
  if (!session) return { ok: false, reason: "unauthenticated" };
  try {
    await softDeleteComment(commentId, session.userId);
    revalidatePath(COMMUNITY_PATH);
    return { ok: true };
  } catch {
    return { ok: false, reason: "remove_failed" };
  }
}
