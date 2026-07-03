import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  BenefitDetail,
  BenefitDetailsMap,
  EditableBenefitKind,
} from "@explore-and-earn/contracts";
import { anonClient, authedClient } from "../client";

/**
 * Persistence for the host benefit editor (BenefitTrustModal).
 *
 * The structured Housing/Meals detail lives in `listings.benefit_details`
 * (JSONB, migration 040), keyed by benefit kind. Every read/write is scoped to
 * the listing the authed host owns — `clerkUserId` MUST come from auth().userId
 * (never decoded from the token), matching the rest of the host write layer.
 */

async function resolveHostProfileId(
  clerkToken: string,
  clerkUserId: string,
): Promise<string | null> {
  const db = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data, error } = await db
    .from("host_profiles")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (error) throw new Error(`resolveHostProfileId: ${error.message}`);
  return data ? (data as { id: string }).id : null;
}

/**
 * Resolve the host_profile id for the authed user IFF they own `listingId`.
 * Returns null when there's no host profile or the listing isn't theirs — the
 * one call the benefit-photo upload action needs to both authorize the write and
 * get the host id for the RLS-scoped storage path.
 */
export async function resolveOwnedListingHost(
  clerkToken: string,
  clerkUserId: string,
  listingId: string,
): Promise<{ hostProfileId: string } | null> {
  if (!listingId) return null;
  const hostProfileId = await resolveHostProfileId(clerkToken, clerkUserId);
  if (!hostProfileId) return null;

  const db = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data, error } = await db
    .from("listings")
    .select("id")
    .eq("id", listingId)
    .eq("host_profile_id", hostProfileId)
    .maybeSingle();
  if (error) throw new Error(`resolveOwnedListingHost: ${error.message}`);
  return data ? { hostProfileId } : null;
}

function asBenefitDetailsMap(raw: unknown): BenefitDetailsMap {
  if (!raw || typeof raw !== "object") return {};
  return raw as BenefitDetailsMap;
}

/**
 * Read the full benefit-details map for a listing the authed host owns.
 * Returns `{}` when the listing is missing, not owned, or has no detail yet.
 */
export async function getBenefitDetails(
  clerkToken: string,
  clerkUserId: string,
  listingId: string,
): Promise<BenefitDetailsMap> {
  if (!listingId) return {};

  const hostProfileId = await resolveHostProfileId(clerkToken, clerkUserId);
  if (!hostProfileId) return {};

  const db = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data, error } = await db
    .from("listings")
    .select("benefit_details")
    .eq("id", listingId)
    .eq("host_profile_id", hostProfileId)
    .maybeSingle();
  if (error) throw new Error(`getBenefitDetails: ${error.message}`);
  if (!data) return {};
  return asBenefitDetailsMap((data as { benefit_details: unknown }).benefit_details);
}

/**
 * Public read of a LIVE listing's benefit detail — no auth. Backs the
 * seeker-facing Housing/Meals viewer (the photos + detail a host published).
 * Only live listings are exposed, matching getPublicListingById's trust level.
 */
export async function getPublicBenefitDetails(
  listingId: string,
): Promise<BenefitDetailsMap> {
  if (!listingId) return {};
  const db = anonClient() as unknown as SupabaseClient;
  const { data, error } = await db
    .from("listings")
    .select("benefit_details")
    .eq("id", listingId)
    .eq("status", "live")
    .maybeSingle();
  if (error) throw new Error(`getPublicBenefitDetails: ${error.message}`);
  if (!data) return {};
  return asBenefitDetailsMap((data as { benefit_details: unknown }).benefit_details);
}

export type SaveBenefitDetailsResult = { ok: boolean; error?: string };

/**
 * Merge one kind's detail into a listing's benefit_details JSONB, preserving the
 * other kind. Read-modify-write under the owner-scoped RLS predicate so a host
 * can only ever mutate their own listing. Pass the already-validated photo URLs
 * inside `detail.photos` — URL origin validation happens at the action layer.
 */
export async function saveBenefitDetails(
  clerkToken: string,
  clerkUserId: string,
  listingId: string,
  kind: EditableBenefitKind,
  detail: BenefitDetail,
): Promise<SaveBenefitDetailsResult> {
  if (!listingId) return { ok: false, error: "Missing listing id." };

  const hostProfileId = await resolveHostProfileId(clerkToken, clerkUserId);
  if (!hostProfileId) return { ok: false, error: "No host profile found for your account." };

  const db = authedClient(clerkToken) as unknown as SupabaseClient;

  const { data: existing, error: readError } = await db
    .from("listings")
    .select("benefit_details")
    .eq("id", listingId)
    .eq("host_profile_id", hostProfileId)
    .maybeSingle();
  if (readError) return { ok: false, error: readError.message };
  if (!existing) {
    return { ok: false, error: "Listing not found or you do not have access to it." };
  }

  const current = asBenefitDetailsMap(
    (existing as { benefit_details: unknown }).benefit_details,
  );
  const next: BenefitDetailsMap = { ...current, [kind]: detail };

  const { data: updated, error: updateError } = await db
    .from("listings")
    .update({ benefit_details: next })
    .eq("id", listingId)
    .eq("host_profile_id", hostProfileId)
    .select("id")
    .maybeSingle();
  if (updateError) return { ok: false, error: updateError.message };
  if (!updated) {
    return { ok: false, error: "Listing not found or you do not have access to it." };
  }
  return { ok: true };
}
