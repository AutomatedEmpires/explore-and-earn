"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import {
  getBenefitDetails,
  saveBenefitDetails,
  resolveOwnedListingHost,
  uploadBenefitPhoto,
} from "@explore-and-earn/db";
import {
  EDITABLE_BENEFIT_KINDS,
  type BenefitDetail,
  type BenefitDetailsMap,
  type EditableBenefitKind,
} from "@explore-and-earn/contracts";

import { isAllowedStorageUrl } from "../../lib/storageUrl";
import { validateUploadFile } from "../../services/media";

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
  const token = await getToken({ template: "supabase" });
  if (!token) {
    return { ok: false, error: "Your session has expired — sign in again to continue." };
  }
  return { ok: true, auth: { userId, token } };
}

function isEditableKind(value: string): value is EditableBenefitKind {
  return (EDITABLE_BENEFIT_KINDS as readonly string[]).includes(value);
}

/**
 * Coerce an untrusted client payload into a clean BenefitDetail. Drops unknown
 * value types and any photo URL that isn't a real Supabase Storage URL, so the
 * persisted JSONB can never carry an off-origin or malformed entry.
 */
function sanitizeBenefitDetail(input: unknown): BenefitDetail {
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
    for (const [k, v] of Object.entries(obj.photos as Record<string, unknown>)) {
      if (typeof v === "string" && v.length > 0 && isAllowedStorageUrl(v)) photos[k] = v;
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

/** Hydrate the benefit editor with whatever detail the host has already saved. */
export async function getBenefitDetailsAction(
  listingId: string,
): Promise<{ ok: boolean; details?: BenefitDetailsMap; error?: string }> {
  if (!listingId) return { ok: false, error: "Missing listing id." };

  const authResult = await resolveHostAuth();
  if (!authResult.ok) return { ok: false, error: authResult.error };

  try {
    const details = await getBenefitDetails(
      authResult.auth.token,
      authResult.auth.userId,
      listingId,
    );
    return { ok: true, details };
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

  const clean = sanitizeBenefitDetail(detail);
  const result = await saveBenefitDetails(
    authResult.auth.token,
    authResult.auth.userId,
    listingId,
    kind,
    clean,
  );
  if (!result.ok) return result;

  revalidatePath("/host/listings");
  revalidatePath(`/host/listings/${listingId}`);
  return { ok: true };
}

/**
 * Upload a single benefit photo for `slot` and return its public URL. Verifies
 * the host owns the listing (which also yields the host id for the RLS-scoped
 * storage path) and re-validates the file server-side before the storage write.
 */
export async function uploadBenefitPhotoAction(
  listingId: string,
  kind: string,
  slot: string,
  formData: FormData,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (!listingId) return { ok: false, error: "Missing listing id." };
  if (!isEditableKind(kind)) return { ok: false, error: "Unknown benefit kind." };
  const slotId = slot.trim();
  if (!slotId) return { ok: false, error: "Missing photo slot." };

  const authResult = await resolveHostAuth();
  if (!authResult.ok) return { ok: false, error: authResult.error };

  const file = formData.get("file");
  const valid = validateUploadFile(file instanceof File ? file : null);
  if (!valid.ok) return { ok: false, error: valid.error };

  const owned = await resolveOwnedListingHost(
    authResult.auth.token,
    authResult.auth.userId,
    listingId,
  );
  if (!owned) {
    return { ok: false, error: "Listing not found or you do not have access to it." };
  }

  try {
    const url = await uploadBenefitPhoto(
      authResult.auth.token,
      owned.hostProfileId,
      listingId,
      kind,
      slotId,
      file as File,
    );
    return { ok: true, url };
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : "Upload failed. Please try again.",
    };
  }
}
