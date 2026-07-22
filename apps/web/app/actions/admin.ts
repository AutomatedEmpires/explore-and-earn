"use server";

import { revalidatePath } from "next/cache";
import {
  adminApproveListing,
  adminCloseListing,
  adminHoldListing,
  adminSetHostAttestationStatus,
  clearHostFlag,
} from "@explore-and-earn/db";

import { isCurrentUserAdmin } from "../../lib/admin";
import { reportError } from "../../lib/sentry";
import { computeAndStoreMatchesForListing } from "../../services/matching";

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

async function approveListingActionImpl(
  listingId: string,
): Promise<ActionResult> {
  const denied = await guardAdmin();
  if (denied) return denied;
  if (!listingId) return { ok: false, error: "Missing listing id." };

  const result = await adminApproveListing(SERVICE_ROLE_KEY, listingId);
  if (!result.ok) return result;

  // The listing just went LIVE — compute its match scores now so host
  // applicant intelligence and strong-match alerts don't wait for the next
  // cron cycle. Best-effort: approval never fails on scoring (the daily
  // new-match cron dedupes anything already scored here).
  try {
    await computeAndStoreMatchesForListing(listingId);
  } catch (error) {
    reportError(error, { action: "approveListingAction:computeMatches" });
  }

  revalidatePath("/listings");
  revalidatePath(`/listings/${listingId}`);
  revalidatePath("/admin");
  return { ok: true };
}

export async function approveListingAction(
  listingId: string,
): Promise<ActionResult> {
  try {
    return await approveListingActionImpl(listingId);
  } catch (error) {
    reportError(error, { action: "approveListingAction" });
    throw error;
  }
}

async function holdListingActionImpl(listingId: string): Promise<ActionResult> {
  const denied = await guardAdmin();
  if (denied) return denied;
  if (!listingId) return { ok: false, error: "Missing listing id." };

  const result = await adminHoldListing(SERVICE_ROLE_KEY, listingId);
  if (!result.ok) return result;

  revalidatePath("/listings");
  revalidatePath(`/listings/${listingId}`);
  revalidatePath("/admin");
  return { ok: true };
}

export async function holdListingAction(
  listingId: string,
): Promise<ActionResult> {
  try {
    return await holdListingActionImpl(listingId);
  } catch (error) {
    reportError(error, { action: "holdListingAction" });
    throw error;
  }
}

async function rejectListingActionImpl(
  listingId: string,
  reason?: string,
): Promise<ActionResult> {
  const denied = await guardAdmin();
  if (denied) return denied;
  if (!listingId) return { ok: false, error: "Missing listing id." };

  const result = await adminCloseListing(SERVICE_ROLE_KEY, listingId, reason);
  if (!result.ok) return result;

  revalidatePath("/listings");
  revalidatePath(`/listings/${listingId}`);
  revalidatePath("/admin");
  return { ok: true };
}

export async function rejectListingAction(
  listingId: string,
  reason?: string,
): Promise<ActionResult> {
  try {
    return await rejectListingActionImpl(listingId, reason);
  } catch (error) {
    reportError(error, { action: "rejectListingAction" });
    throw error;
  }
}

async function verifyHostActionImpl(
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

  revalidatePath("/hosts");
  revalidatePath("/admin");
  return { ok: true };
}

export async function verifyHostAction(
  hostProfileId: string,
): Promise<ActionResult> {
  try {
    return await verifyHostActionImpl(hostProfileId);
  } catch (error) {
    reportError(error, { action: "verifyHostAction" });
    throw error;
  }
}

async function unverifyHostActionImpl(
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

  revalidatePath("/hosts");
  revalidatePath("/admin");
  return { ok: true };
}

export async function unverifyHostAction(
  hostProfileId: string,
): Promise<ActionResult> {
  try {
    return await unverifyHostActionImpl(hostProfileId);
  } catch (error) {
    reportError(error, { action: "unverifyHostAction" });
    throw error;
  }
}

async function clearHostFlagActionImpl(
  hostProfileId: string,
): Promise<ActionResult> {
  const denied = await guardAdmin();
  if (denied) return denied;
  if (!hostProfileId) return { ok: false, error: "Missing host profile id." };

  const result = await clearHostFlag(SERVICE_ROLE_KEY, hostProfileId);
  if (!result.ok) return result;

  revalidatePath("/hosts");
  revalidatePath("/admin");
  return { ok: true };
}

/** Clear a host's automatic spam-report flag (admin-only). */
export async function clearHostFlagAction(
  hostProfileId: string,
): Promise<ActionResult> {
  try {
    return await clearHostFlagActionImpl(hostProfileId);
  } catch (error) {
    reportError(error, { action: "clearHostFlagAction" });
    throw error;
  }
}
