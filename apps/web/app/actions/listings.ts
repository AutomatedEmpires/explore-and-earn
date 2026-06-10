"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import {
  createListing as createListingRow,
  duplicateListing as duplicateListingRow,
  updateListing as updateListingRow,
  updateListingStatus as updateListingStatusRow,
  type ListingWriteFields,
} from "@explore-and-earn/db";
import {
  COMPENSATION_UNIT,
  MARKETPLACE_CATEGORIES,
  type CompensationUnit,
  type MarketplaceCategory,
} from "@explore-and-earn/contracts";

type HostManageableListingStatus = "live" | "paused" | "archived";

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

function resolvePayPeriod(raw: FormDataEntryValue | null): CompensationUnit | undefined {
  const value = typeof raw === "string" ? raw : "";
  return (COMPENSATION_UNIT as readonly string[]).includes(value)
    ? (value as CompensationUnit)
    : undefined;
}

function isAllowedStorageUrl(url: string | undefined | null): boolean {
  if (!url) return true;
  try {
    const { protocol, hostname, pathname } = new URL(url);
    return (
      protocol === "https:" &&
      hostname.endsWith(".supabase.co") &&
      pathname.startsWith("/storage/v1/object/")
    );
  } catch {
    return false;
  }
}

function parseAmount(raw: FormDataEntryValue | null): number | null | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/**
 * Read the create/edit listing form into ListingWriteFields. Only keys the form
 * actually submits are set, so the same reader serves create and update.
 */
function readListingFields(formData: FormData): ListingWriteFields {
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

  const payMin = parseAmount(formData.get("payMin"));
  if (payMin !== undefined) fields.payMin = payMin;
  const payMax = parseAmount(formData.get("payMax"));
  if (payMax !== undefined) fields.payMax = payMax;

  const payPeriod = resolvePayPeriod(formData.get("payPeriod"));
  if (payPeriod !== undefined) fields.payPeriod = payPeriod;

  const payCurrency = optionalString(formData.get("payCurrency"));
  if (payCurrency !== undefined) fields.payCurrency = payCurrency;

  if (formData.has("startDate")) {
    fields.startDate = optionalString(formData.get("startDate")) ?? null;
  }
  if (formData.has("endDate")) {
    fields.endDate = optionalString(formData.get("endDate")) ?? null;
  }
  if (formData.has("coverPhotoUrl")) {
    fields.coverPhotoUrl = optionalString(formData.get("coverPhotoUrl")) ?? null;
  }

  return fields;
}

export async function createListingAction(
  formData: FormData,
): Promise<{ ok: boolean; listingId?: string; error?: string }> {
  const authResult = await resolveHostAuth();
  if (!authResult.ok) {
    return { ok: false, error: authResult.error };
  }

  const fields = readListingFields(formData);
  if (!isAllowedStorageUrl(fields.coverPhotoUrl)) {
    return { ok: false, error: "Invalid cover photo URL." };
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

  const fields = readListingFields(formData);
  if (!isAllowedStorageUrl(fields.coverPhotoUrl)) {
    return { ok: false, error: "Invalid cover photo URL." };
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
    return result;
  }

  revalidatePath("/host/listings");
  revalidatePath(`/host/listings/${listingId}`);
  return result;
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
  if (result.newListingId) {
    revalidatePath(`/host/listings/${result.newListingId}`);
  }
  return result;
}
