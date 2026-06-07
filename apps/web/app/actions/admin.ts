"use server";

import { revalidatePath } from "next/cache";
import {
  adminApproveListing,
  adminCloseListing,
  adminSetHostAttestationStatus,
} from "@explore-and-earn/db";

import { isCurrentUserAdmin } from "../../lib/admin";

interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Service role key is read server-side only. Server actions are independently
 * invocable endpoints, so each one below RE-VERIFIES the caller is an admin
 * before touching the service-role client (defense in depth on top of the
 * (admin) layout gate and Clerk middleware).
 */
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

async function guardAdmin(): Promise<ActionResult | null> {
  if (!(await isCurrentUserAdmin())) {
    return { ok: false, error: "forbidden" };
  }
  return null;
}

export async function approveListingAction(
  listingId: string,
): Promise<ActionResult> {
  const denied = await guardAdmin();
  if (denied) return denied;
  if (!listingId) return { ok: false, error: "Missing listing id." };

  const result = await adminApproveListing(SERVICE_ROLE_KEY, listingId);
  if (!result.ok) return result;

  revalidatePath("/admin/listings");
  revalidatePath("/admin");
  return { ok: true };
}

export async function rejectListingAction(
  listingId: string,
  reason?: string,
): Promise<ActionResult> {
  const denied = await guardAdmin();
  if (denied) return denied;
  if (!listingId) return { ok: false, error: "Missing listing id." };

  const result = await adminCloseListing(SERVICE_ROLE_KEY, listingId, reason);
  if (!result.ok) return result;

  revalidatePath("/admin/listings");
  revalidatePath("/admin");
  return { ok: true };
}

export async function verifyHostAction(
  hostProfileId: string,
): Promise<ActionResult> {
  const denied = await guardAdmin();
  if (denied) return denied;
  if (!hostProfileId) return { ok: false, error: "Missing host profile id." };

  const result = await adminSetHostAttestationStatus(
    SERVICE_ROLE_KEY,
    hostProfileId,
    "attested",
  );
  if (!result.ok) return result;

  revalidatePath("/admin/hosts");
  revalidatePath("/admin");
  return { ok: true };
}

export async function unverifyHostAction(
  hostProfileId: string,
): Promise<ActionResult> {
  const denied = await guardAdmin();
  if (denied) return denied;
  if (!hostProfileId) return { ok: false, error: "Missing host profile id." };

  const result = await adminSetHostAttestationStatus(
    SERVICE_ROLE_KEY,
    hostProfileId,
    "not_attested",
  );
  if (!result.ok) return result;

  revalidatePath("/admin/hosts");
  revalidatePath("/admin");
  return { ok: true };
}
