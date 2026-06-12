import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpportunityCategory } from "@explore-and-earn/contracts";

import { authedClient } from "../client";
import { getPublicListingsByIds, rowToDiscoveryFields } from "./listings";

/**
 * Saved-listings data access for the seeker swipe / saved experience.
 *
 * SECURITY: Row Level Security is NOT yet enabled on `saved_listings`.
 * Every query is scoped in application code by the `seeker_profile_id`
 * resolved from the already-verified `clerkUserId`.
 *
 * TYPES: see savedListings TYPES note -- untyped client for clerk_user_id.
 */

const SAVED_STATUS = "saved" as const;
const REMOVED_STATUS = "removed" as const;

function untypedClient(clerkToken: string): SupabaseClient {
  return authedClient(clerkToken) as unknown as SupabaseClient;
}

async function resolveSeekerProfileId(
  db: SupabaseClient,
  clerkUserId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("seeker_profiles")
    .select("id, clerk_user_id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (error) {
    throw new Error(`resolveSeekerProfileId: ${error.message}`);
  }
  return data ? (data as { id: string }).id : null;
}

export async function saveListing(
  clerkToken: string,
  clerkUserId: string,
  listingId: string,
): Promise<{ ok: boolean }> {
  try {
    const db = untypedClient(clerkToken);
    const seekerProfileId = await resolveSeekerProfileId(db, clerkUserId);
    if (!seekerProfileId) {
      return { ok: false };
    }

    const { error } = await db.from("saved_listings").upsert(
      {
        seeker_profile_id: seekerProfileId,
        listing_id: listingId,
        status: SAVED_STATUS,
      },
      { onConflict: "seeker_profile_id,listing_id" },
    );
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}

export async function saveListingWithStatus(
  clerkToken: string,
  clerkUserId: string,
  listingId: string,
): Promise<{ ok: boolean; alreadySaved: boolean }> {
  try {
    const db = untypedClient(clerkToken);
    const seekerProfileId = await resolveSeekerProfileId(db, clerkUserId);
    if (!seekerProfileId) {
      return { ok: false, alreadySaved: false };
    }

    const { data: existing } = await db
      .from("saved_listings")
      .select("status")
      .eq("seeker_profile_id", seekerProfileId)
      .eq("listing_id", listingId)
      .maybeSingle();
    const alreadySaved =
      (existing as { status?: string } | null)?.status === SAVED_STATUS;

    const { error } = await db.from("saved_listings").upsert(
      {
        seeker_profile_id: seekerProfileId,
        listing_id: listingId,
        status: SAVED_STATUS,
      },
      { onConflict: "seeker_profile_id,listing_id" },
    );
    return { ok: !error, alreadySaved };
  } catch {
    return { ok: false, alreadySaved: false };
  }
}
export async function unsaveListing(
  clerkToken: string,
  clerkUserId: string,
  listingId: string,
): Promise<{ ok: boolean }> {
  try {
    const db = untypedClient(clerkToken);
    const seekerProfileId = await resolveSeekerProfileId(db, clerkUserId);
    if (!seekerProfileId) {
      return { ok: false };
    }

    const { error } = await db
      .from("saved_listings")
      .update({ status: REMOVED_STATUS })
      .eq("seeker_profile_id", seekerProfileId)
      .eq("listing_id", listingId);
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}

export async function getSavedListingIds(
  clerkToken: string,
  clerkUserId: string,
): Promise<string[]> {
  const db = untypedClient(clerkToken);
  const seekerProfileId = await resolveSeekerProfileId(db, clerkUserId);
  if (!seekerProfileId) {
    return [];
  }

  const { data, error } = await db
    .from("saved_listings")
    .select("listing_id, created_at")
    .eq("seeker_profile_id", seekerProfileId)
    .eq("status", SAVED_STATUS)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(`getSavedListingIds: ${error.message}`);
  }

  return ((data ?? []) as Array<{ listing_id: string }>).map(
    (row) => row.listing_id,
  );
}

/* -------------------------------------------------------------------------- */
/* Saved listing detail for /saved dashboard (Wave 10 / Agent B).             */
/* -------------------------------------------------------------------------- */

/** Benefit sub-item shape used by SavedListingDetail. */
export interface SavedListingBenefit {
  readonly provision: string;
  readonly summary?: string;
}

/** Full saved listing detail for the /saved card grid. */
export interface SavedListingDetail {
  readonly id: string;
  readonly title: string;
  readonly category: OpportunityCategory;
  readonly location: string;
  readonly opportunityWindow: string;
  readonly status: string;
  readonly host: { readonly name: string; readonly verified: boolean };
  readonly benefits: {
    readonly housing: SavedListingBenefit;
    readonly meals: SavedListingBenefit;
    readonly pay: SavedListingBenefit;
  };
  readonly coverImageUrl?: string;
  /** True when the seeker already has a non-withdrawn application for this listing. */
  readonly alreadyApplied: boolean;
}

/**
 * Saved listings joined to full live-listing detail + host, with an
 * `alreadyApplied` flag computed from the applications table.
 *
 * Returns an empty array when the seeker has no profile or no saved listings.
 */
export async function getSavedListingsWithDetails(
  clerkToken: string,
  clerkUserId: string,
): Promise<SavedListingDetail[]> {
  const db = untypedClient(clerkToken);
  const seekerProfileId = await resolveSeekerProfileId(db, clerkUserId);
  if (!seekerProfileId) return [];

  // Saved listing ids, newest-saved first.
  const { data: savedRows, error: savedError } = await db
    .from("saved_listings")
    .select("listing_id, created_at")
    .eq("seeker_profile_id", seekerProfileId)
    .eq("status", SAVED_STATUS)
    .order("created_at", { ascending: false });
  if (savedError) {
    throw new Error(`getSavedListingsWithDetails: ${savedError.message}`);
  }
  const savedIds = ((savedRows ?? []) as Array<{ listing_id: string }>).map(
    (row) => row.listing_id,
  );
  if (savedIds.length === 0) return [];

  // Fetch live listing rows + applied set in parallel.
  const [rows, appliedResult] = await Promise.all([
    getPublicListingsByIds(savedIds),
    db
      .from("applications")
      .select("listing_id")
      .eq("seeker_profile_id", seekerProfileId)
      .neq("status", "withdrawn")
      .in("listing_id", savedIds),
  ]);

  if (appliedResult.error) {
    throw new Error(
      `getSavedListingsWithDetails(applications): ${appliedResult.error.message}`,
    );
  }
  const appliedSet = new Set(
    ((appliedResult.data ?? []) as Array<{ listing_id: string }>).map((r) =>
      String(r.listing_id),
    ),
  );

  const rowById = new Map(rows.map((row) => [row.id, row] as const));

  return savedIds
    .map((id) => rowById.get(id))
    .filter((row): row is NonNullable<typeof row> => row !== undefined)
    .map((row): SavedListingDetail => ({
      ...rowToDiscoveryFields(row),
      alreadyApplied: appliedSet.has(row.id),
    }));
}
