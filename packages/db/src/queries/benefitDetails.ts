import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  BenefitDetail,
  BenefitDetailsMap,
  EditableBenefitKind,
  EffectiveHousingPhoto,
  HostBenefitLibrary,
  HousingPhotoMap,
  HousingPhotoRole,
  HousingPhotoSource,
} from "@explore-and-earn/contracts";
import {
  HOUSING_PHOTO_ROLES,
  sanitizeHostBenefitLibrary,
} from "@explore-and-earn/contracts";
import { anonClient, authedClient } from "../client";

interface PostgrestErrorLike {
  readonly code?: string;
  readonly message?: string;
}

function isUnavailableSchemaFeature(error: PostgrestErrorLike | null): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    error.message?.includes("Could not find the function") === true ||
    error.message?.includes("does not exist") === true
  );
}

interface OwnedBenefitContextRow {
  readonly host_profile_id: string;
  readonly benefit_details: unknown;
  readonly benefit_library: unknown;
  readonly subscription_tier?: string;
}

async function ownedBenefitContextRpc(
  db: SupabaseClient,
  listingId: string,
): Promise<{ available: boolean; row: OwnedBenefitContextRow | null }> {
  const { data, error } = await db.rpc("get_owned_benefit_context", {
    p_listing_id: listingId,
  });
  if (error) {
    if (isUnavailableSchemaFeature(error)) return { available: false, row: null };
    throw new Error(`getOwnedBenefitContext: ${error.message}`);
  }
  const row = Array.isArray(data) ? data[0] : null;
  return {
    available: true,
    row: row && typeof row === "object" ? (row as OwnedBenefitContextRow) : null,
  };
}

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
  const context = await ownedBenefitContextRpc(db, listingId);
  if (context.available) {
    return context.row ? asBenefitDetailsMap(context.row.benefit_details) : {};
  }

  // Backward-compatible during an app-before-072 rollout. Once 072 lands the
  // RPC is authoritative and raw column SELECT is revoked.
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

export interface BenefitDetailsContext {
  readonly details: BenefitDetailsMap;
  readonly benefitLibrary: HostBenefitLibrary;
  /** False until migration 072's owner RPC is available. */
  readonly housingPhotoLibraryAvailable: boolean;
}

function isHousingPhotoRole(value: unknown): value is HousingPhotoRole {
  return (
    typeof value === "string" &&
    (HOUSING_PHOTO_ROLES as readonly string[]).includes(value)
  );
}

function isHousingPhotoSource(value: unknown): value is HousingPhotoSource {
  return value === "profile" || value === "listing";
}

/**
 * The sole anonymous boundary for housing evidence. The SECURITY DEFINER RPC
 * returns exactly four effective rows only for a live, verified, Housing
 * Included listing with confirmed evidence; raw profile defaults stay private.
 */
export async function getPublicHousingPhotos(
  listingId: string,
  client?: SupabaseClient,
): Promise<readonly EffectiveHousingPhoto[]> {
  if (!listingId) return [];
  const db = client ?? (anonClient() as unknown as SupabaseClient);
  const { data, error } = await db.rpc("get_public_housing_photos", {
    p_listing_id: listingId,
  });
  if (error) {
    if (isUnavailableSchemaFeature(error)) return [];
    throw new Error(`getPublicHousingPhotos: ${error.message}`);
  }
  if (!Array.isArray(data)) return [];

  const photos = data.flatMap<EffectiveHousingPhoto>((row) => {
    if (!row || typeof row !== "object") return [];
    const candidate = row as Record<string, unknown>;
    if (
      !isHousingPhotoRole(candidate.role) ||
      typeof candidate.url !== "string" ||
      candidate.url.length === 0 ||
      !isHousingPhotoSource(candidate.source)
    ) {
      return [];
    }
    return [{
      role: candidate.role,
      url: candidate.url,
      source: candidate.source,
    }];
  });
  const complete =
    photos.length === HOUSING_PHOTO_ROLES.length &&
    HOUSING_PHOTO_ROLES.every(
      (role) => photos.filter((photo) => photo.role === role).length === 1,
    );
  return complete ? photos : [];
}

/** Listing overrides plus the caller's reusable host defaults for the editor. */
export async function getBenefitDetailsContext(
  clerkToken: string,
  clerkUserId: string,
  listingId: string,
): Promise<BenefitDetailsContext> {
  const hostProfileId = await resolveHostProfileId(clerkToken, clerkUserId);
  if (!hostProfileId) {
    return {
      details: {},
      benefitLibrary: {},
      housingPhotoLibraryAvailable: false,
    };
  }

  const db = authedClient(clerkToken) as unknown as SupabaseClient;
  const context = await ownedBenefitContextRpc(db, listingId);
  if (context.available) {
    return {
      details: context.row
        ? asBenefitDetailsMap(context.row.benefit_details)
        : {},
      benefitLibrary: sanitizeHostBenefitLibrary(
        context.row?.benefit_library,
      ),
      housingPhotoLibraryAvailable: true,
    };
  }

  const { data: listing, error } = await db
    .from("listings")
    .select("benefit_details")
    .eq("id", listingId)
    .eq("host_profile_id", hostProfileId)
    .maybeSingle();
  if (error) throw new Error(`getBenefitDetailsContext: ${error.message}`);
  return {
    details: listing
      ? asBenefitDetailsMap((listing as { benefit_details: unknown }).benefit_details)
      : {},
    benefitLibrary: {},
    housingPhotoLibraryAvailable: false,
  };
}

/**
 * Public read of a LIVE listing's benefit detail — no auth. Backs the
 * seeker-facing Housing/Meals viewer (the photos + detail a host published).
 * Only live listings are exposed, matching getPublicListingById's trust level.
 */
export async function getPublicBenefitDetails(
  listingId: string,
  client?: SupabaseClient,
): Promise<BenefitDetailsMap> {
  if (!listingId) return {};
  const db = client ?? (anonClient() as unknown as SupabaseClient);
  const { data: safeDetails, error: rpcError } = await db.rpc(
    "get_public_benefit_details",
    { p_listing_id: listingId },
  );
  if (!rpcError) return asBenefitDetailsMap(safeDetails);
  if (!isUnavailableSchemaFeature(rpcError)) {
    throw new Error(`getPublicBenefitDetails: ${rpcError.message}`);
  }

  // App-before-migration compatibility. The public RPC replaces this path as
  // soon as 072 applies, at which point raw benefit_details is no longer readable.
  const { data, error } = await db
    .from("listings")
    .select(
      "benefit_details,housing_included,meals_included," +
        "housing_evidence,meals_evidence,provenance",
    )
    .eq("id", listingId)
    .eq("status", "live")
    .eq("provenance", "verified")
    .maybeSingle();
  if (error) throw new Error(`getPublicBenefitDetails: ${error.message}`);
  if (!data) return {};

  const listing = data as unknown as {
    benefit_details: unknown;
    housing_included: boolean | null;
    meals_included: boolean | null;
    housing_evidence: string | null;
    meals_evidence: string | null;
  };
  const raw = asBenefitDetailsMap(listing.benefit_details);
  // During the app-before-072 window, mirror the RPC's eligibility boundary
  // and fail closed on unconfirmed benefits. In particular, a sourced/prior
  // host's raw JSON must never become the newly attached host's public claim.
  const details: BenefitDetailsMap = {
    ...(listing.housing_included === true &&
    listing.housing_evidence === "confirmed" &&
    raw.housing
      ? {
          housing: {
            ...raw.housing,
            // The old database cannot prove effective four-role ownership.
            photos: {},
          },
        }
      : {}),
    ...(listing.meals_included === true &&
    listing.meals_evidence === "confirmed" &&
    raw.meals
      ? { meals: raw.meals }
      : {}),
  };
  const effective = await getPublicHousingPhotos(listingId, db);
  const existingHousing = details.housing;
  if (!existingHousing && effective.length === 0) return details;
  const photos = Object.fromEntries(
    effective.map((photo) => [photo.role, photo.url]),
  ) as HousingPhotoMap;

  return {
    ...details,
    housing: {
      fields: existingHousing?.fields ?? {},
      toggles: existingHousing?.toggles ?? {},
      photos,
      ...(existingHousing?.customChips
        ? { customChips: existingHousing.customChips }
        : {}),
    },
  };
}

export type SaveBenefitDetailsResult = {
  ok: boolean;
  error?: string;
  /** The exact detail displaced by this write, for race-safe media cleanup. */
  previous?: BenefitDetail;
};

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
  const { data: atomicData, error: atomicError } = await db.rpc(
    "save_owned_benefit_detail",
    {
      p_listing_id: listingId,
      p_kind: kind,
      p_detail: detail,
    },
  );
  if (!atomicError) {
    const row = Array.isArray(atomicData) ? atomicData[0] : null;
    if (!row || typeof row !== "object") {
      return { ok: false, error: "Listing not found or you do not have access to it." };
    }
    const previous = (row as { previous_detail?: unknown }).previous_detail;
    return {
      ok: true,
      ...(previous && typeof previous === "object"
        ? { previous: previous as BenefitDetail }
        : {}),
    };
  }
  if (!isUnavailableSchemaFeature(atomicError)) {
    return { ok: false, error: atomicError.message };
  }

  // App-before-072 compatibility for the existing Meals editor. Housing is
  // capability-gated until the migration lands. Once installed, the atomic
  // RPC above is authoritative and prevents cross-kind lost updates.
  let current: BenefitDetailsMap;
  try {
    const context = await ownedBenefitContextRpc(db, listingId);
    if (context.available) {
      if (!context.row) {
        return { ok: false, error: "Listing not found or you do not have access to it." };
      }
      current = asBenefitDetailsMap(context.row.benefit_details);
    } else {
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
      current = asBenefitDetailsMap(
        (existing as { benefit_details: unknown }).benefit_details,
      );
    }
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : "Could not load benefit details.",
    };
  }
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
  return { ok: true, ...(current[kind] ? { previous: current[kind] } : {}) };
}
