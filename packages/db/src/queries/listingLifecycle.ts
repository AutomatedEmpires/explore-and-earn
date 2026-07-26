import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  effectiveHousingPhotoMap,
  sanitizeHostBenefitLibrary,
  sanitizeHousingPhotoMap,
  validateListingForPublication,
  type BenefitEvidenceStatus,
  type ListingStatus,
  type PublicationBlocker,
} from "@explore-and-earn/contracts";
import { adminClient } from "../adminClient";
import { authedClient } from "../client";
import {
  countsTowardListingAllowance,
  hasListingCapacity,
  parseListingAllowanceState,
} from "../lib/entitlements";
import { getBenefitDetailsContext } from "./benefitDetails";

/**
 * Read an evidence column, degrading anything unrecognised to the WEAKEST
 * claim. An unreadable value must never be treated as though someone confirmed
 * it — here that would let an unanswered listing publish.
 */
function asPublicationEvidence(value: unknown): BenefitEvidenceStatus {
  return value === "stated" || value === "confirmed" ? value : "not_stated";
}

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
  /**
   * Present with error === "incomplete_listing": exactly which benefits the
   * host still has to answer. A single `error: string` has no channel for
   * "three fields are unanswered", and a host told only "something went wrong"
   * would have to guess which — so the field-keyed detail rides alongside.
   */
  blockers?: readonly PublicationBlocker[];
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
    .select(
      "id,status,provenance,housing_evidence,meals_evidence,pay_evidence," +
        "housing_included,compensation_min_cents,compensation_max_cents",
    )
    .eq("id", listingId)
    .eq("host_profile_id", hostProfileId)
    .maybeSingle();
  if (readError) return { ok: false, error: readError.message };
  if (!existing) {
    return { ok: false, error: "Listing not found or you do not have access to it." };
  }

  const row = existing as unknown as Record<string, unknown>;
  const current = row.status as ListingStatus;
  if (current === newStatus) return { ok: true, status: newStatus };
  if (!canTransitionListing(current, newStatus)) {
    return { ok: false, error: "invalid_transition" };
  }

  let hostProfile: Record<string, unknown> | null = null;
  let benefitDetails: Record<string, unknown> = {};
  if (
    (newStatus === "under_review" || newStatus === "live") &&
    row.provenance !== "sourced" &&
    row.housing_included === true
  ) {
    try {
      const context = await getBenefitDetailsContext(
        clerkToken,
        clerkUserId,
        listingId,
      );
      benefitDetails = context.details as Record<string, unknown>;
      hostProfile = { benefit_library: context.benefitLibrary };
    } catch (cause) {
      return {
        ok: false,
        error: cause instanceof Error ? cause.message : "benefit_context_unavailable",
      };
    }
  }

  // ── The publication gate (founder, 2026-07-17) ──────────────────────────────
  // A host-controlled listing may not face seekers while Housing, Meals or Pay
  // is unanswered. Checked on the transitions that PUBLISH — draft->under_review
  // and paused->live — never on the ones that retreat, so a host can always pull
  // a listing down and a draft can always stay half-finished.
  //
  // This is not the enforcement; migration 070's listings_publication_triad_chk
  // is (PostgREST hands `authenticated` full-column UPDATE on listings, so a
  // determined client never runs this code). This exists so the host is told
  // WHICH fields are missing, in their own words, instead of meeting a raw
  // 23514 constraint violation.
  if (newStatus === "under_review" || newStatus === "live") {
    const housingDetail =
      benefitDetails.housing && typeof benefitDetails.housing === "object"
        ? (benefitDetails.housing as Record<string, unknown>)
        : {};
    const verdict = validateListingForPublication({
      provenance: row.provenance === "sourced" ? "sourced" : "verified",
      housingEvidence: asPublicationEvidence(row.housing_evidence),
      housingIncluded:
        typeof row.housing_included === "boolean" ? row.housing_included : undefined,
      housingPhotos: effectiveHousingPhotoMap(
        sanitizeHostBenefitLibrary(hostProfile?.benefit_library),
        sanitizeHousingPhotoMap(housingDetail.photos),
      ),
      mealsEvidence: asPublicationEvidence(row.meals_evidence),
      payEvidence: asPublicationEvidence(row.pay_evidence),
      payMinCents: typeof row.compensation_min_cents === "number" ? row.compensation_min_cents : null,
      payMaxCents: typeof row.compensation_max_cents === "number" ? row.compensation_max_cents : null,
    });
    if (!verdict.ok) {
      return {
        ok: false,
        error: "incomplete_listing",
        blockers: verdict.blockers,
      };
    }
  }

  // The plan listing allowance.
  //
  // This is NOT the enforcement — migration 083's trg_listings_plan_allowance is
  // (`authenticated` can PATCH `status` through PostgREST, so a determined client
  // never runs this code). It exists so a host meets "you are at your plan limit"
  // instead of a raw 23514, and it reads the allowance through the RPC that wraps
  // the trigger's OWN helpers, so the number it quotes cannot drift from the
  // number the database enforces.
  //
  // Checked only when the target status newly occupies a slot AND the current one
  // does not. live <-> paused and under_review -> live move between two counted
  // statuses and consume nothing, so gating them would refuse a host who is
  // legitimately at their allowance.
  if (
    countsTowardListingAllowance(newStatus) &&
    !countsTowardListingAllowance(current)
  ) {
    const { data: allowanceData, error: allowanceError } = await db.rpc(
      "my_listing_allowance_state",
      { p_host_profile_id: hostProfileId },
    );
    if (allowanceError) return { ok: false, error: allowanceError.message };

    const allowance = parseListingAllowanceState(allowanceData);
    if (!hasListingCapacity(allowance.used, allowance.allowance)) {
      return { ok: false, error: "listing_cap_reached" };
    }
  }

  // Status ONLY. published_at/paused_at/archived_at are stamped by
  // trg_listings_status_timestamps (071) from the transition itself.
  //
  // This is not a tidy-up — it is required. 071 revokes the blanket UPDATE grant
  // that let a host PATCH `provenance` and walk out of 070's publication gate,
  // and re-grants only the columns hosts legitimately write. Those three
  // timestamps are deliberately NOT in that list (a host must not be able to
  // forge when their listing went live), so sending them here would now fail
  // with "permission denied for column". Same pairing as 067's expires_at.
  const { data: updated, error: updateError } = await db
    .from("listings")
    .update({ status: newStatus })
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

// housing_evidence/meals_evidence/pay_evidence travel WITH their values. They
// are not decoration: a duplicate that copied `housing_included = true` and let
// the evidence fall back to the 070 default would assert a benefit that nobody
// stated — and violate listings_housing_included_evidence_chk on insert. The
// host said this about the original; the copy is the same listing.
//
// The descriptions come too, for the same reason 070 exists: copying the
// decision while dropping the prose leaves a listing claiming "Housing:
// Included" with nothing behind it.
const COPYABLE_LISTING_COLUMNS =
  "title,category,description,location_display,latitude,longitude," +
  "housing_included,meals_included,housing_description,meals_description," +
  "housing_evidence,meals_evidence,pay_evidence," +
  "compensation_summary,compensation_min_cents," +
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
