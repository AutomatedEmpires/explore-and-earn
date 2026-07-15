import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ListingClaimStatus } from "@explore-and-earn/contracts";

import { adminClient } from "../adminClient";
import { authedClient } from "../client";

/**
 * Employer claim-to-verify workflow — the data layer.
 *
 * STATE LAW: claim rows are inserted here (entry point) and mutated ONLY via
 * the atomic SQL functions from migration 064 — transition_listing_claim
 * (legal-transition + self-approval guards, row-locked) and
 * convert_claimed_listing (transactional sourced→verified conversion that
 * PRESERVES source lineage). Clients never write status; every caller of the
 * service-role paths must have done authn/authz in the server action layer.
 *
 * COMPETING CLAIMS: the one-active-claim partial unique index makes a second
 * concurrent claim a typed 'claim_already_active' error, never a race.
 */

function db(): SupabaseClient {
  return adminClient() as unknown as SupabaseClient;
}

const UNIQUE_VIOLATION = "23505";

/* -------------------------------------------------------------------- reads */

/** What the claim surface shows about a claimable listing. */
export interface ClaimableListing {
  readonly listingId: string;
  readonly title: string;
  readonly sourceName: string | null;
  readonly sourceEmployerName: string | null;
  readonly claimSummary: string;
  readonly provenance: string;
  readonly status: string;
}

export async function getClaimableListing(
  listingId: string,
): Promise<ClaimableListing | null> {
  const { data, error } = await db()
    .from("listings")
    .select("id, title, source_name, source_employer_name, claim_summary, provenance, status")
    .eq("id", listingId)
    .maybeSingle();
  if (error) throw new Error(`getClaimableListing: ${error.message}`);
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    listingId: String(row.id),
    title: String(row.title),
    sourceName: typeof row.source_name === "string" ? row.source_name : null,
    sourceEmployerName:
      typeof row.source_employer_name === "string" ? row.source_employer_name : null,
    claimSummary: String(row.claim_summary),
    provenance: String(row.provenance),
    status: String(row.status),
  };
}

export interface ListingClaimRecord {
  readonly id: string;
  readonly listingId: string;
  readonly status: ListingClaimStatus;
  readonly hostProfileId: string | null;
  readonly reviewNotes: string | null;
  readonly createdAt: string;
  readonly decidedAt: string | null;
}

function rowToClaim(row: Record<string, unknown>): ListingClaimRecord {
  return {
    id: String(row.id),
    listingId: String(row.listing_id),
    status: row.status as ListingClaimStatus,
    hostProfileId: typeof row.host_profile_id === "string" ? row.host_profile_id : null,
    reviewNotes: typeof row.review_notes === "string" ? row.review_notes : null,
    createdAt: String(row.created_at),
    decidedAt: typeof row.decided_at === "string" ? row.decided_at : null,
  };
}

const CLAIM_SELECT = "id, listing_id, status, host_profile_id, review_notes, created_at, decided_at";

/** The caller's own claims (authed client — the RLS select-own policy). */
export async function getMyListingClaims(
  clerkToken: string,
  clerkUserId: string,
): Promise<ListingClaimRecord[]> {
  const client = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data, error } = await client
    .from("listing_claims")
    .select(CLAIM_SELECT)
    .eq("claimant_clerk_user_id", clerkUserId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`getMyListingClaims: ${error.message}`);
  return ((data ?? []) as Array<Record<string, unknown>>).map(rowToClaim);
}

/** Admin review queue: claims awaiting a decision. */
export async function getClaimsAwaitingReview(limit = 50): Promise<
  Array<ListingClaimRecord & { claimantClerkUserId: string; authorityEvidence: unknown }>
> {
  const { data, error } = await db()
    .from("listing_claims")
    .select(`${CLAIM_SELECT}, claimant_clerk_user_id, authority_evidence`)
    .in("status", ["requires_review", "verification_pending"])
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`getClaimsAwaitingReview: ${error.message}`);
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    ...rowToClaim(row),
    claimantClerkUserId: String(row.claimant_clerk_user_id),
    authorityEvidence: row.authority_evidence,
  }));
}

/* ------------------------------------------------------------------- writes */

export interface AuthorityEvidence {
  /** Work email at the employer (identity signal for the human reviewer). */
  readonly workEmail: string;
  /** Claimant's role at the employer. */
  readonly roleTitle: string;
  /** Free-text statement of authority to represent the employer. */
  readonly statement: string;
}

export type ClaimActionResult = {
  readonly ok: boolean;
  readonly claimId?: string;
  readonly error?: string;
};

/**
 * Initiate a claim on a live SOURCED listing. Caller (server action) has
 * authenticated the user; this enforces the listing-side preconditions and
 * the one-active-claim guard, then routes the claim straight into founder
 * review (the conservative launch path — no self-service approval exists).
 */
export async function initiateListingClaim(
  clerkUserId: string,
  listingId: string,
  evidence: AuthorityEvidence,
): Promise<ClaimActionResult> {
  const client = db();

  const { data: listing, error: listingError } = await client
    .from("listings")
    .select("id, provenance, status, claim_summary")
    .eq("id", listingId)
    .maybeSingle();
  if (listingError) return { ok: false, error: listingError.message };
  if (!listing) return { ok: false, error: "listing_not_found" };
  const row = listing as Record<string, unknown>;
  if (row.provenance !== "sourced") return { ok: false, error: "listing_not_sourced" };
  if (row.status !== "live") return { ok: false, error: "listing_not_live" };
  if (row.claim_summary === "converted") return { ok: false, error: "already_converted" };

  const { data: inserted, error: insertError } = await client
    .from("listing_claims")
    .insert({
      listing_id: listingId,
      claimant_clerk_user_id: clerkUserId,
      status: "initiated",
      authority_evidence: {
        workEmail: evidence.workEmail,
        roleTitle: evidence.roleTitle,
        statement: evidence.statement,
      },
    })
    .select("id")
    .single();
  if (insertError) {
    if (insertError.code === UNIQUE_VIOLATION) {
      return { ok: false, error: "claim_already_active" };
    }
    return { ok: false, error: insertError.message };
  }
  const claimId = String((inserted as { id: string }).id);

  // Enter the review pipeline atomically (also stamps the listing's
  // claim_summary → 'claim_pending' inside the SQL function).
  const transition = await transitionListingClaim(claimId, "requires_review", clerkUserId);
  if (!transition.ok) return { ok: false, claimId, error: transition.error };

  return { ok: true, claimId };
}

/** Run one legal state transition via the atomic SQL function. */
export async function transitionListingClaim(
  claimId: string,
  toStatus: ListingClaimStatus,
  actorUserId: string,
  reviewNotes?: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await db().rpc("transition_listing_claim", {
    p_claim_id: claimId,
    p_to_status: toStatus,
    p_actor_user_id: actorUserId,
    p_review_notes: reviewNotes ?? null,
  });
  if (error) return { ok: false, error: error.message };
  const result = data as { ok?: boolean; error?: string } | null;
  if (!result?.ok) return { ok: false, error: result?.error ?? "transition_failed" };
  return { ok: true };
}

/**
 * The approved claimant attaches THEIR host profile and begins confirmation.
 * Ownership of the host profile is re-verified here (server-side), never
 * trusted from the client.
 */
export async function beginClaimConfirmation(
  clerkUserId: string,
  claimId: string,
): Promise<{ ok: boolean; error?: string; hostProfileId?: string }> {
  const client = db();

  const { data: claim, error: claimError } = await client
    .from("listing_claims")
    .select("id, status, claimant_clerk_user_id")
    .eq("id", claimId)
    .maybeSingle();
  if (claimError) return { ok: false, error: claimError.message };
  if (!claim) return { ok: false, error: "claim_not_found" };
  const claimRow = claim as Record<string, unknown>;
  if (claimRow.claimant_clerk_user_id !== clerkUserId) {
    return { ok: false, error: "not_claimant" };
  }
  if (claimRow.status !== "approved") {
    return { ok: false, error: "claim_not_approved" };
  }

  // The claimant's OWN host profile — resolved from the verified identity.
  const { data: host, error: hostError } = await client
    .from("host_profiles")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (hostError) return { ok: false, error: hostError.message };
  if (!host) return { ok: false, error: "host_profile_required" };
  const hostProfileId = String((host as { id: string }).id);

  const { error: attachError } = await client
    .from("listing_claims")
    .update({ host_profile_id: hostProfileId, updated_at: new Date().toISOString() })
    .eq("id", claimId)
    .eq("claimant_clerk_user_id", clerkUserId)
    .eq("status", "approved");
  if (attachError) return { ok: false, error: attachError.message };

  const transition = await transitionListingClaim(claimId, "confirming", clerkUserId);
  if (!transition.ok) return { ok: false, error: transition.error };
  return { ok: true, hostProfileId };
}

/** Whitelisted employer-confirmed fields applied at conversion. */
export interface ClaimConfirmedFields {
  readonly title?: string;
  readonly description?: string;
  readonly locationDisplay?: string;
  readonly housingIncluded?: boolean;
  readonly housingDescription?: string;
  readonly mealsIncluded?: boolean;
  readonly mealsDescription?: string;
  readonly compensationMinCents?: number;
  readonly compensationMaxCents?: number;
  readonly compensationUnit?: string;
  readonly compensationSummary?: string;
  readonly beginsAt?: string;
  readonly endsAt?: string;
}

/**
 * Final, explicit confirmation: converts the listing sourced→verified in ONE
 * transaction (convert_claimed_listing), attaching the claimant's host and
 * marking every benefit employer-confirmed — while the original source
 * lineage columns are preserved untouched for auditability.
 */
export async function confirmAndConvertClaim(
  clerkUserId: string,
  claimId: string,
  hostProfileId: string,
  confirmed: ClaimConfirmedFields,
): Promise<{ ok: boolean; error?: string; listingId?: string }> {
  const { data, error } = await db().rpc("convert_claimed_listing", {
    p_claim_id: claimId,
    p_actor_user_id: clerkUserId,
    p_host_profile_id: hostProfileId,
    p_confirmed: confirmed,
  });
  if (error) return { ok: false, error: error.message };
  const result = data as { ok?: boolean; error?: string; listing_id?: string } | null;
  if (!result?.ok) return { ok: false, error: result?.error ?? "conversion_failed" };
  return { ok: true, listingId: result.listing_id };
}
