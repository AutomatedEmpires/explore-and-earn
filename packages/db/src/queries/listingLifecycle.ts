import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { PLAN_ENTITLEMENTS, type ListingStatus, type PlanTier } from "@explore-and-earn/contracts";
import { adminClient } from "../adminClient";
import { authedClient } from "../client";

/**
 * Host-initiated listing status transitions (Agent 3 / PR 1).
 *
 * The server is the authoritative gate; the client mirrors this map only to
 * decide which action buttons to show. Note: there is intentionally NO
 * under_review -> live edge — publishing a reviewed listing to live is a
 * separate approval flow outside this host control set.
 */
const LISTING_STATUS_TRANSITIONS: Record<ListingStatus, readonly ListingStatus[]> = {
  draft: ["under_review"],
  under_review: ["draft"],
  live: ["paused", "archived"],
  paused: ["live", "archived"],
  closed: [],
  archived: [],
};

/** True when `from -> to` is a permitted host listing transition. */
export function canTransitionListing(from: ListingStatus, to: ListingStatus): boolean {
  return (LISTING_STATUS_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Statuses that count toward PLAN_ENTITLEMENTS[tier].listings (ADR-039) —
 * "each active (live or paused) listing counts toward your plan limit; you
 * can have unlimited drafts on any plan" per the host-facing FAQ copy
 * (HostSettings.tsx AddOnsSection), which already stated this policy before
 * any code enforced it.
 */
const CAP_COUNTED_STATUSES: readonly ListingStatus[] = ["live", "paused"];

/** "none" (no active subscription) is floored at the starter entitlement,
 * same policy as the boost-purchase tier fallback — the lowest real paid
 * tier, not zero and not unlimited. */
function listingCapFor(tier: PlanTier): number {
  const entitlementTier = tier === "professional" || tier === "enterprise" ? tier : "starter";
  return PLAN_ENTITLEMENTS[entitlementTier].listings;
}

/**
 * Resolve host_profiles.id for the authed Clerk user. Replicated locally (the
 * listings.ts copy is private) so this module stays self-contained.
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

export type UpdateListingStatusResult = {
  ok: boolean;
  status?: ListingStatus;
  error?: string;
};

/**
 * Move a listing to a new lifecycle status. Validates the transition and
 * confirms the authed user's host profile owns the listing before writing.
 * Returns { ok: false, error: 'invalid_transition' } for a disallowed edge.
 *
 * `clerkUserId` MUST come from auth().userId (never decoded from the token).
 */
export async function updateListingStatus(
  clerkToken: string,
  clerkUserId: string,
  listingId: string,
  newStatus: ListingStatus,
): Promise<UpdateListingStatusResult> {
  if (!listingId) return { ok: false, error: "Missing listing id." };

  const hostProfileId = await resolveHostProfileId(clerkToken, clerkUserId);
  if (!hostProfileId) return { ok: false, error: "No host profile found for your account." };

  const db = authedClient(clerkToken) as unknown as SupabaseClient;

  const { data: existing, error: readError } = await db
    .from("listings")
    .select("id,status")
    .eq("id", listingId)
    .eq("host_profile_id", hostProfileId)
    .maybeSingle();
  if (readError) return { ok: false, error: readError.message };
  if (!existing) {
    return { ok: false, error: "Listing not found or you do not have access to it." };
  }

  const current = (existing as { status: string }).status as ListingStatus;
  if (current === newStatus) return { ok: true, status: newStatus };
  if (!canTransitionListing(current, newStatus)) {
    return { ok: false, error: "invalid_transition" };
  }

  // Enforce PLAN_ENTITLEMENTS.listings at the one host-initiated transition
  // that can newly consume a slot: submitting a draft for review. (live<->paused
  // don't need this check — both already count as "active" per
  // CAP_COUNTED_STATUSES, so pausing/resuming never changes the count.)
  if (newStatus === "under_review") {
    const { data: hostProfile, error: tierError } = await db
      .from("host_profiles")
      .select("subscription_tier")
      .eq("id", hostProfileId)
      .maybeSingle();
    if (tierError) return { ok: false, error: tierError.message };

    const tier = ((hostProfile as { subscription_tier: string | null } | null)
      ?.subscription_tier ?? "none") as PlanTier;
    const cap = listingCapFor(tier);

    const { count: activeCount, error: countError } = await db
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("host_profile_id", hostProfileId)
      .in("status", CAP_COUNTED_STATUSES);
    if (countError) return { ok: false, error: countError.message };

    if ((activeCount ?? 0) >= cap) {
      return { ok: false, error: "listing_cap_reached" };
    }
  }

  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = { status: newStatus };
  if (newStatus === "live") patch.published_at = nowIso;
  else if (newStatus === "paused") patch.paused_at = nowIso;
  else if (newStatus === "archived") patch.archived_at = nowIso;

  const { data: updated, error: updateError } = await db
    .from("listings")
    .update(patch)
    .eq("id", listingId)
    .eq("host_profile_id", hostProfileId)
    .select("id")
    .maybeSingle();
  if (updateError) return { ok: false, error: updateError.message };
  if (!updated) {
    return { ok: false, error: "Listing not found or you do not have access to it." };
  }

  return { ok: true, status: newStatus };
}

export type DuplicateListingResult = {
  ok: boolean;
  newListingId?: string;
  error?: string;
};

const COPYABLE_LISTING_COLUMNS =
  "title,category,description,location_display,latitude,longitude," +
  "housing_included,meals_included,compensation_summary,compensation_min_cents," +
  "compensation_max_cents,compensation_unit,compensation_currency,timeline_summary," +
  "begins_at,ends_at,cover_photo_url";

/**
 * Duplicate a listing the authed user owns — for recurring seasonal reposts.
 * Clones the editable fields, resets the lifecycle to a fresh draft, and
 * appends " (copy)" to the title. The cover photo URL stays linked. Lifecycle
 * timestamps and role counts fall back to DB defaults, and expires_at is
 * reseeded by the 022 insert trigger (a duplicate gets a fresh 90-day window).
 *
 * `clerkUserId` MUST come from auth().userId.
 */
export async function duplicateListing(
  clerkToken: string,
  clerkUserId: string,
  listingId: string,
): Promise<DuplicateListingResult> {
  if (!listingId) return { ok: false, error: "Missing listing id." };

  const hostProfileId = await resolveHostProfileId(clerkToken, clerkUserId);
  if (!hostProfileId) return { ok: false, error: "No host profile found for your account." };

  const db = authedClient(clerkToken) as unknown as SupabaseClient;

  const { data: source, error: readError } = await db
    .from("listings")
    .select(COPYABLE_LISTING_COLUMNS)
    .eq("id", listingId)
    .eq("host_profile_id", hostProfileId)
    .maybeSingle();
  if (readError) return { ok: false, error: readError.message };
  if (!source) {
    return { ok: false, error: "Listing not found or you do not have access to it." };
  }

  const row = source as unknown as Record<string, unknown>;
  const baseTitle =
    typeof row.title === "string" && row.title.trim().length > 0
      ? row.title
      : "Untitled listing";

  const insertRow = {
    ...row,
    host_profile_id: hostProfileId,
    title: `${baseTitle} (copy)`,
    status: "draft",
  };

  const { data: created, error: insertError } = await db
    .from("listings")
    .insert(insertRow)
    .select("id")
    .single();
  if (insertError || !created) {
    return { ok: false, error: insertError?.message ?? "Could not duplicate the listing." };
  }

  return { ok: true, newListingId: (created as { id: string }).id };
}

export type ExpireListingsResult = {
  ok: boolean;
  archived: number;
  ids: string[];
  error?: string;
};

/**
 * System-initiated expiry sweep — archive every live listing whose
 * `expires_at` timestamp has passed.
 *
 * Uses the service-role admin client (RLS-bypassing) so the sweep covers
 * every host's listings without needing a Clerk token. The transition is
 * validated against the canonical lifecycle map via `canTransitionListing`
 * before any write is attempted.
 *
 * Idempotent: only listings currently in `status = 'live'` are updated, so
 * running the sweep multiple times has no additional effect.
 *
 * Intended to be called exclusively by `GET /api/cron/expire-listings`.
 */
export async function expireListings(
  serviceRoleKey?: string,
): Promise<ExpireListingsResult> {
  // Guard: assert the lifecycle engine permits live → archived.
  if (!canTransitionListing("live", "archived")) {
    return {
      ok: false,
      archived: 0,
      ids: [],
      error: "invalid_transition: live → archived is not permitted by the lifecycle engine",
    };
  }

  const nowIso = new Date().toISOString();
  const db = adminClient(serviceRoleKey) as unknown as SupabaseClient;

  const { data, error } = await db
    .from("listings")
    .update({ status: "archived", archived_at: nowIso })
    .lt("expires_at", nowIso)
    .eq("status", "live")
    .select("id");

  if (error) {
    return { ok: false, archived: 0, ids: [], error: error.message };
  }

  const ids = (data ?? []).map((row: { id: string }) => row.id);
  return { ok: true, archived: ids.length, ids };
}
