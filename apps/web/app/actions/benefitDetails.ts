"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath, revalidateTag } from "next/cache";

import {
  deleteTrustedListingMedia,
  getBenefitDetailsContext,
  getPublicBenefitDetails,
  saveBenefitDetails,
  resolveOwnedListingHost,
  uploadTrustedListingMedia,
} from "@explore-and-earn/db";
import {
  EDITABLE_BENEFIT_KINDS,
  HOUSING_PHOTO_ROLES,
  sanitizeHousingPhotoMap,
  type BenefitDetail,
  type BenefitDetailsMap,
  type EditableBenefitKind,
  type HostBenefitLibrary,
} from "@explore-and-earn/contracts";

import { isOwnedBenefitPhotoUrl } from "../../lib/storageUrl";
import { LISTINGS_CACHE_TAG } from "../../lib/serverCache";
import { reportError } from "../../lib/sentry";
import { prepareUploadImage } from "../../services/media";
import {
  guardTrustedUploadSlot,
  hasTrustedUploadBudget,
} from "../../services/media/trustedUploadGuard";

interface HostAuth {
  userId: string;
  token: string;
}

async function resolveHostAuth(): Promise<
  { ok: true; auth: HostAuth } | { ok: false; error: string }
> {
  const { userId, getToken } = await auth();
  if (!userId) {
    return { ok: false, error: "You must be signed in as a host to edit benefits." };
  }
  const token = await getToken();
  if (!token) {
    return { ok: false, error: "Your session has expired — sign in again to continue." };
  }
  return { ok: true, auth: { userId, token } };
}

function isEditableKind(value: string): value is EditableBenefitKind {
  return (EDITABLE_BENEFIT_KINDS as readonly string[]).includes(value);
}

const MEALS_PHOTO_SLOTS = ["kitchen", "prepared", "dining", "misc"] as const;

function validatePhotoSlot(
  kind: EditableBenefitKind,
  slot: string,
): { ok: true; slot: string } | { ok: false; error: string } {
  const slotId = slot.trim();
  if (!slotId) return { ok: false, error: "Missing photo slot." };
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(slotId)) {
    return { ok: false, error: "Unknown photo slot." };
  }
  if (
    kind === "housing" &&
    !(HOUSING_PHOTO_ROLES as readonly string[]).includes(slotId)
  ) {
    return { ok: false, error: "Unknown housing photo role." };
  }
  if (
    kind === "meals" &&
    !(MEALS_PHOTO_SLOTS as readonly string[]).includes(slotId)
  ) {
    return { ok: false, error: "Unknown meals photo slot." };
  }
  return { ok: true, slot: slotId };
}

/**
 * Convert an already origin-validated public URL to the one exact object path
 * this host/listing/kind/slot owns. Only a single version filename is accepted;
 * Meals' historical exact-slot object remains cleanup-compatible.
 */
function ownedBenefitPhotoObjectPath(
  url: string,
  hostProfileId: string,
  listingId: string,
  kind: EditableBenefitKind,
  slot: string,
): string | null {
  if (!isOwnedBenefitPhotoUrl(url, hostProfileId, listingId, kind, slot)) {
    return null;
  }
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    const marker = "/storage/v1/object/public/listing-media/";
    if (!parsed.pathname.startsWith(marker)) return null;
    const encodedPath = parsed.pathname.slice(marker.length);
    const path = decodeURIComponent(encodedPath);
    const base = `${hostProfileId}/benefit/${listingId}/${kind}/${slot}`;
    if (kind === "meals" && path === base) return path;
    if (!path.startsWith(`${base}/`)) return null;
    const filename = path.slice(base.length + 1);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(filename)) return null;
    return path;
  } catch {
    return null;
  }
}

async function cleanupReplacedBenefitPhotos(
  previous: BenefitDetail | undefined,
  next: BenefitDetail,
  hostProfileId: string,
  listingId: string,
  kind: EditableBenefitKind,
  userId: string,
): Promise<void> {
  for (const [slot, previousUrl] of Object.entries(previous?.photos ?? {})) {
    if (typeof previousUrl !== "string" || next.photos?.[slot] === previousUrl) {
      continue;
    }
    const path = ownedBenefitPhotoObjectPath(
      previousUrl,
      hostProfileId,
      listingId,
      kind,
      slot,
    );
    if (!path) continue;
    try {
      await deleteTrustedListingMedia(path);
    } catch (cause) {
      // The structured detail is already safely persisted. Object cleanup is
      // best effort and must never turn that successful save into a failure.
      reportError(cause, {
        action: "cleanupReplacedBenefitPhoto",
        userId,
      });
    }
  }
}

/**
 * Coerce an untrusted client payload into a clean BenefitDetail. Drops unknown
 * value types and any photo URL that isn't a real Supabase Storage URL, so the
 * persisted JSONB can never carry an off-origin or malformed entry.
 */
function sanitizeBenefitDetail(
  input: unknown,
  kind: EditableBenefitKind,
  hostProfileId: string,
  listingId: string,
): BenefitDetail {
  const obj = (input ?? {}) as Record<string, unknown>;

  const fields: Record<string, string> = {};
  if (obj.fields && typeof obj.fields === "object") {
    for (const [k, v] of Object.entries(obj.fields as Record<string, unknown>)) {
      if (typeof v === "string" && v.length > 0) fields[k] = v;
    }
  }

  const toggles: Record<string, string[]> = {};
  if (obj.toggles && typeof obj.toggles === "object") {
    for (const [k, v] of Object.entries(obj.toggles as Record<string, unknown>)) {
      if (Array.isArray(v)) toggles[k] = v.filter((x): x is string => typeof x === "string");
    }
  }

  const photos: Record<string, string> = {};
  if (obj.photos && typeof obj.photos === "object") {
    const inputPhotos =
      kind === "housing"
        ? sanitizeHousingPhotoMap(obj.photos)
        : (obj.photos as Record<string, unknown>);
    for (const [k, v] of Object.entries(inputPhotos)) {
      if (
        typeof v === "string" &&
        v.length > 0 &&
        isOwnedBenefitPhotoUrl(v, hostProfileId, listingId, kind, k)
      ) {
        photos[k] = v;
      }
    }
  }

  const customChips: Record<string, { id: string; label: string }[]> = {};
  if (obj.customChips && typeof obj.customChips === "object") {
    for (const [k, v] of Object.entries(obj.customChips as Record<string, unknown>)) {
      if (Array.isArray(v)) {
        const chips = v
          .filter((c): c is { id: string; label: string } =>
            !!c && typeof c === "object" &&
            typeof (c as { id?: unknown }).id === "string" &&
            typeof (c as { label?: unknown }).label === "string",
          )
          .map((c) => ({ id: c.id, label: c.label }));
        if (chips.length > 0) customChips[k] = chips;
      }
    }
  }

  const detail: BenefitDetail = { fields, toggles, photos };
  if (Object.keys(customChips).length > 0) {
    return { ...detail, customChips };
  }
  return detail;
}

/**
 * Public (no-auth) read of a live listing's benefit detail — backs the
 * seeker-facing Housing/Meals viewer (photos + structured detail the host
 * published). Returns {} for non-live/missing listings.
 */
export async function getPublicBenefitDetailsAction(
  listingId: string,
): Promise<BenefitDetailsMap> {
  if (!listingId) return {};
  try {
    return await getPublicBenefitDetails(listingId);
  } catch {
    return {};
  }
}

/** Hydrate the benefit editor with whatever detail the host has already saved. */
export async function getBenefitDetailsAction(
  listingId: string,
): Promise<{
  ok: boolean;
  details?: BenefitDetailsMap;
  benefitLibrary?: HostBenefitLibrary;
  housingPhotoLibraryAvailable?: boolean;
  error?: string;
}> {
  if (!listingId) return { ok: false, error: "Missing listing id." };

  const authResult = await resolveHostAuth();
  if (!authResult.ok) return { ok: false, error: authResult.error };

  try {
    const context = await getBenefitDetailsContext(
      authResult.auth.token,
      authResult.auth.userId,
      listingId,
    );
    return {
      ok: true,
      details: context.details,
      benefitLibrary: context.benefitLibrary,
      housingPhotoLibraryAvailable: context.housingPhotoLibraryAvailable,
    };
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : "Could not load benefit details.",
    };
  }
}

/** Persist one kind's structured benefit detail for a listing the host owns. */
export async function saveBenefitDetailsAction(
  listingId: string,
  kind: string,
  detail: unknown,
): Promise<{ ok: boolean; error?: string }> {
  if (!listingId) return { ok: false, error: "Missing listing id." };
  if (!isEditableKind(kind)) return { ok: false, error: "Unknown benefit kind." };

  const authResult = await resolveHostAuth();
  if (!authResult.ok) return { ok: false, error: authResult.error };

  const owned = await resolveOwnedListingHost(
    authResult.auth.token,
    authResult.auth.userId,
    listingId,
  );
  if (!owned) {
    return { ok: false, error: "Listing not found or you do not have access to it." };
  }

  const clean = sanitizeBenefitDetail(
    detail,
    kind,
    owned.hostProfileId,
    listingId,
  );
  let previous: BenefitDetail | undefined;
  try {
    previous = (
      await getBenefitDetailsContext(
        authResult.auth.token,
        authResult.auth.userId,
        listingId,
      )
    ).details[kind];
  } catch (cause) {
    // Saving still has its own authoritative read/ownership checks. A failed
    // cleanup snapshot should degrade to skipped cleanup, not block the edit.
    reportError(cause, {
      action: "loadPreviousBenefitPhotosForCleanup",
      userId: authResult.auth.userId,
    });
  }
  const result = await saveBenefitDetails(
    authResult.auth.token,
    authResult.auth.userId,
    listingId,
    kind,
    clean,
  );
  if (!result.ok) return result;

  await cleanupReplacedBenefitPhotos(
    previous,
    clean,
    owned.hostProfileId,
    listingId,
    kind,
    authResult.auth.userId,
  );

  revalidatePath("/host/listings");
  revalidatePath(`/host/listings/${listingId}`);
  revalidatePath(`/listing/${listingId}`);
  revalidateTag(LISTINGS_CACHE_TAG);
  return { ok: true };
}

/**
 * Upload a single benefit photo for `slot` and return its public URL. Verifies
 * the host owns the listing, decodes and normalizes the image, then writes the
 * prepared bytes through the trusted server-only Storage boundary.
 */
export async function uploadBenefitPhotoAction(
  listingId: string,
  kind: string,
  slot: string,
  formData: FormData,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (!listingId) return { ok: false, error: "Missing listing id." };
  if (!isEditableKind(kind)) return { ok: false, error: "Unknown benefit kind." };
  const validSlot = validatePhotoSlot(kind, slot);
  if (!validSlot.ok) return { ok: false, error: validSlot.error };
  const slotId = validSlot.slot;

  const authResult = await resolveHostAuth();
  if (!authResult.ok) return { ok: false, error: authResult.error };
  if (!(await hasTrustedUploadBudget(authResult.auth.userId))) {
    return {
      ok: false,
      error: "Too many photo uploads. Wait a few minutes and try again.",
    };
  }

  const owned = await resolveOwnedListingHost(
    authResult.auth.token,
    authResult.auth.userId,
    listingId,
  );
  if (!owned) {
    return { ok: false, error: "Listing not found or you do not have access to it." };
  }
  const context = await getBenefitDetailsContext(
    authResult.auth.token,
    authResult.auth.userId,
    listingId,
  );
  if (kind === "housing" && !context.housingPhotoLibraryAvailable) {
    return { ok: false, error: "Housing photos are not available yet. Reload and try again." };
  }

  const prefix =
    `${owned.hostProfileId}/benefit/${listingId}/${kind}/${slotId}`;
  const referencedPaths = new Set<string>();
  for (const url of Object.values(context.details[kind]?.photos ?? {})) {
    if (typeof url !== "string") continue;
    const path = ownedBenefitPhotoObjectPath(
      url,
      owned.hostProfileId,
      listingId,
      kind,
      slotId,
    );
    if (path?.startsWith(`${prefix}/`)) referencedPaths.add(path);
  }
  try {
    const slotGuard = await guardTrustedUploadSlot({
      prefix,
      referencedPaths,
    });
    if (!slotGuard.ok) return slotGuard;
  } catch (cause) {
    reportError(cause, {
      action: "guardBenefitPhotoUpload",
      userId: authResult.auth.userId,
    });
    return {
      ok: false,
      error: "Photo uploads are temporarily unavailable. Please try again.",
    };
  }

  const file = formData.get("file");
  const prepared = await prepareUploadImage(file instanceof File ? file : null);
  if (!prepared.ok) return { ok: false, error: prepared.error };

  try {
    const objectId = crypto.randomUUID();
    const path = `${prefix}/${objectId}.webp`;
    const url = await uploadTrustedListingMedia({
      path,
      bytes: prepared.image.bytes,
      contentType: prepared.image.contentType,
    });
    return { ok: true, url };
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : "Upload failed. Please try again.",
    };
  }
}

/**
 * Remove an unsaved upload created by the benefit editor. Ownership is resolved
 * again on the server and the current structured detail is checked first; the
 * database reference trigger remains the final race-proof protection.
 */
export async function discardBenefitPhotoAction(
  listingId: string,
  kind: string,
  slot: string,
  url: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!listingId) return { ok: false, error: "Missing listing id." };
  if (!isEditableKind(kind)) return { ok: false, error: "Unknown benefit kind." };
  const validSlot = validatePhotoSlot(kind, slot);
  if (!validSlot.ok) return { ok: false, error: validSlot.error };
  if (!url) return { ok: false, error: "Missing photo URL." };

  const authResult = await resolveHostAuth();
  if (!authResult.ok) return { ok: false, error: authResult.error };
  const owned = await resolveOwnedListingHost(
    authResult.auth.token,
    authResult.auth.userId,
    listingId,
  );
  if (!owned) {
    return { ok: false, error: "Listing not found or you do not have access to it." };
  }

  const path = ownedBenefitPhotoObjectPath(
    url,
    owned.hostProfileId,
    listingId,
    kind,
    validSlot.slot,
  );
  if (!path) return { ok: false, error: "Photo does not belong to this benefit slot." };
  const filename = path.slice(path.lastIndexOf("/") + 1);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/.test(
      filename,
    )
  ) {
    return { ok: false, error: "Photo does not belong to this benefit slot." };
  }

  try {
    const context = await getBenefitDetailsContext(
      authResult.auth.token,
      authResult.auth.userId,
      listingId,
    );
    if (
      Object.values(context.details[kind]?.photos ?? {}).includes(url)
    ) {
      return { ok: false, error: "Save your changes before discarding this photo." };
    }
    await deleteTrustedListingMedia(path);
    return { ok: true };
  } catch (cause) {
    reportError(cause, {
      action: "discardBenefitPhotoAction",
      userId: authResult.auth.userId,
    });
    return { ok: false, error: "Could not discard the photo. Please try again." };
  }
}
