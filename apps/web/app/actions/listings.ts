"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath, revalidateTag } from "next/cache";

import { LISTINGS_CACHE_TAG } from "../../lib/serverCache";
import {
  createListing as createListingRow,
  duplicateListing as duplicateListingRow,
  updateListing as updateListingRow,
  updateListingStatus as updateListingStatusRow,
  type ListingWriteFields,
} from "@explore-and-earn/db";
import {
  MARKETPLACE_CATEGORIES,
  resolveListingPayDraft,
  type MarketplaceCategory,
} from "@explore-and-earn/contracts";

import { isAllowedStorageUrl } from "../../lib/storageUrl";

// Host-controllable transitions. The authoritative gate is canTransitionListing
// in @explore-and-earn/db (draft↔under_review, live↔paused, →archived); this
// union just lets the host UI submit a draft for review and withdraw it. Going
// under_review → live remains an admin-only approval (adminApproveListing).
type HostManageableListingStatus =
  | "draft"
  | "under_review"
  | "live"
  | "paused"
  | "archived";

interface HostAuth {
  userId: string;
  token: string;
}

/**
 * Resolve the Clerk user id + Supabase-templated JWT for the current host.
 *
 * Per repo auth law: `userId` comes from `auth().userId` (never decoded from the
 * token), and the Supabase RLS token uses the "supabase" JWT template. Both are
 * required so the db layer can scope every write to the caller's host profile.
 */
async function resolveHostAuth(): Promise<
  { ok: true; auth: HostAuth } | { ok: false; error: string }
> {
  const { userId, getToken } = await auth();
  if (!userId) {
    return { ok: false, error: "You must be signed in as a host to manage listings." };
  }
  const token = await getToken({ template: "supabase" });
  if (!token) {
    return { ok: false, error: "Your session has expired — sign in again to continue." };
  }
  return { ok: true, auth: { userId, token } };
}

function optionalString(raw: FormDataEntryValue | null): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveCategory(raw: FormDataEntryValue | null): MarketplaceCategory | undefined {
  const value = typeof raw === "string" ? raw : "";
  return (MARKETPLACE_CATEGORIES as readonly string[]).includes(value)
    ? (value as MarketplaceCategory)
    : undefined;
}

/**
 * Read the create/edit listing form into ListingWriteFields. Only keys the form
 * actually submits are set, so the same reader serves create and update.
 */
function readListingFields(
  formData: FormData,
): { ok: true; fields: ListingWriteFields } | { ok: false; error: string } {
  const fields: ListingWriteFields = {};

  const title = optionalString(formData.get("title"));
  if (title !== undefined) fields.title = title;

  const category = resolveCategory(formData.get("category"));
  if (category !== undefined) fields.category = category;

  if (formData.has("locationName")) {
    fields.locationName = optionalString(formData.get("locationName")) ?? null;
  }
  if (formData.has("summary")) {
    fields.summary = optionalString(formData.get("summary")) ?? null;
  }
  if (formData.has("housingDescription")) {
    fields.housingDescription = optionalString(formData.get("housingDescription")) ?? null;
  }
  if (formData.has("mealsDescription")) {
    fields.mealsDescription = optionalString(formData.get("mealsDescription")) ?? null;
  }

  if (
    formData.has("payMin") ||
    formData.has("payMax") ||
    formData.has("payPeriod")
  ) {
    const pay = resolveListingPayDraft({
      minInput:
        typeof formData.get("payMin") === "string"
          ? String(formData.get("payMin"))
          : "",
      maxInput:
        typeof formData.get("payMax") === "string"
          ? String(formData.get("payMax"))
          : "",
      unit:
        typeof formData.get("payPeriod") === "string"
          ? String(formData.get("payPeriod"))
          : "",
      currency: optionalString(formData.get("payCurrency")),
    });
    if (!pay.ok) return { ok: false, error: pay.error };

    // Explicit nulls are intentional: an edit with a cleared field must clear
    // the old cents value instead of silently omitting that column from PATCH.
    fields.payMin = pay.value.minAmount;
    fields.payMax = pay.value.maxAmount;
    fields.payPeriod = pay.value.unit;
    if (formData.has("payCurrency")) {
      fields.payCurrency = pay.value.currency;
    }
  }

  if (formData.has("startDate")) {
    fields.startDate = optionalString(formData.get("startDate")) ?? null;
  }
  if (formData.has("endDate")) {
    fields.endDate = optionalString(formData.get("endDate")) ?? null;
  }
  if (formData.has("coverPhotoUrl")) {
    fields.coverPhotoUrl = optionalString(formData.get("coverPhotoUrl")) ?? null;
  }

  if (formData.has("galleryUrls")) {
    const raw = formData.get("galleryUrls");
    if (typeof raw === "string") {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          fields.galleryUrls = parsed.filter((u): u is string => typeof u === "string");
        }
      } catch {
        // Malformed JSON — ignore and leave galleryUrls unset.
      }
    }
  }

  return { ok: true, fields };
}

export async function createListingAction(
  formData: FormData,
): Promise<{ ok: boolean; listingId?: string; error?: string }> {
  const authResult = await resolveHostAuth();
  if (!authResult.ok) {
    return { ok: false, error: authResult.error };
  }

  const parsed = readListingFields(formData);
  if (!parsed.ok) return parsed;
  const { fields } = parsed;
  if (!isAllowedStorageUrl(fields.coverPhotoUrl)) {
    return { ok: false, error: "Invalid cover photo URL." };
  }
  if (fields.galleryUrls) {
    for (const url of fields.galleryUrls) {
      if (!isAllowedStorageUrl(url)) {
        return { ok: false, error: "Invalid gallery photo URL." };
      }
    }
  }
  const result = await createListingRow(
    authResult.auth.token,
    authResult.auth.userId,
    fields,
  );

  if (!result.ok) {
    return result;
  }

  revalidatePath("/host/listings");
  // Bust the public discovery caches (feed, listing detail) so a publish/edit/
  // status change is visible immediately, not after the 60s revalidate window.
  revalidateTag(LISTINGS_CACHE_TAG);
  if (result.listingId) {
    revalidatePath(`/host/listings/${result.listingId}`);
  }
  return result;
}

export async function updateListingAction(
  listingId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  if (!listingId) {
    return { ok: false, error: "Missing listing id." };
  }

  const authResult = await resolveHostAuth();
  if (!authResult.ok) {
    return { ok: false, error: authResult.error };
  }

  const parsed = readListingFields(formData);
  if (!parsed.ok) return parsed;
  const { fields } = parsed;
  if (!isAllowedStorageUrl(fields.coverPhotoUrl)) {
    return { ok: false, error: "Invalid cover photo URL." };
  }
  if (fields.galleryUrls) {
    for (const url of fields.galleryUrls) {
      if (!isAllowedStorageUrl(url)) {
        return { ok: false, error: "Invalid gallery photo URL." };
      }
    }
  }
  const result = await updateListingRow(
    authResult.auth.token,
    authResult.auth.userId,
    listingId,
    fields,
  );

  if (!result.ok) {
    return result;
  }

  revalidatePath("/host/listings");
  // Bust the public discovery caches (feed, listing detail) so a publish/edit/
  // status change is visible immediately, not after the 60s revalidate window.
  revalidateTag(LISTINGS_CACHE_TAG);
  revalidatePath(`/host/listings/${listingId}`);
  return result;
}

export async function updateListingStatusAction(
  listingId: string,
  newStatus: HostManageableListingStatus,
): Promise<{ ok: boolean; status?: HostManageableListingStatus; error?: string }> {
  if (!listingId) {
    return { ok: false, error: "Missing listing id." };
  }

  const authResult = await resolveHostAuth();
  if (!authResult.ok) {
    return { ok: false, error: authResult.error };
  }

  const result = await updateListingStatusRow(
    authResult.auth.token,
    authResult.auth.userId,
    listingId,
    newStatus,
  );
  if (!result.ok) {
    // The canonical lifecycle fn rejects disallowed edges with 'invalid_transition'
    // and a plan-capacity block with 'listing_cap_reached'.
    const error =
      result.error === "invalid_transition"
        ? "That status change isn't allowed from the listing's current state."
        : result.error === "listing_cap_reached"
          ? "You've reached your plan's active listing limit. Pause or close another listing, or upgrade your plan, to publish this one."
          : result.error;
    return { ok: false, error };
  }

  revalidatePath("/host/listings");
  // Bust the public discovery caches (feed, listing detail) so a publish/edit/
  // status change is visible immediately, not after the 60s revalidate window.
  revalidateTag(LISTINGS_CACHE_TAG);
  revalidatePath(`/host/listings/${listingId}`);
  return { ok: true, status: newStatus };
}

export async function pauseListingAction(
  listingId: string,
): Promise<{ ok: boolean; error?: string }> {
  const result = await updateListingStatusAction(listingId, "paused");
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function resumeListingAction(
  listingId: string,
): Promise<{ ok: boolean; error?: string }> {
  const result = await updateListingStatusAction(listingId, "live");
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function archiveListingAction(
  listingId: string,
): Promise<{ ok: boolean; error?: string }> {
  const result = await updateListingStatusAction(listingId, "archived");
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function duplicateListingAction(
  listingId: string,
): Promise<{ ok: boolean; newListingId?: string; error?: string }> {
  if (!listingId) {
    return { ok: false, error: "Missing listing id." };
  }

  const authResult = await resolveHostAuth();
  if (!authResult.ok) {
    return { ok: false, error: authResult.error };
  }

  const result = await duplicateListingRow(
    authResult.auth.token,
    authResult.auth.userId,
    listingId,
  );
  if (!result.ok) {
    return result;
  }

  revalidatePath("/host/listings");
  // Bust the public discovery caches (feed, listing detail) so a publish/edit/
  // status change is visible immediately, not after the 60s revalidate window.
  revalidateTag(LISTINGS_CACHE_TAG);
  if (result.newListingId) {
    revalidatePath(`/host/listings/${result.newListingId}`);
  }
  return result;
}
