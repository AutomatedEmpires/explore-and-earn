import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BenefitProvision,
  BenefitTriad,
  ListingStatus,
  OpportunityCategory,
} from "@explore-and-earn/contracts";
import {
  formatCompensation,
  formatOpportunityWindow,
  hasVerifiedHostSubscription,
} from "@explore-and-earn/contracts";

import { adminClient } from "../adminClient";
import { authedClient } from "../client";
import { resolveSeekerName } from "../lib/hostApplicantView";
import { applyToListing, type ApplyResult } from "./applications";
import { getSeekerDisplayNames } from "./seekerProfiles";

/**
 * Resolve seeker_profiles.id for the authed Clerk user.
 *
 * `clerkUserId` must come from `auth().userId` — never decode it from the token.
 */
async function resolveSeekerProfileId(
  clerkToken: string,
  clerkUserId: string,
): Promise<string | null> {
  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data, error } = await untyped
    .from("seeker_profiles")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (error) {
    throw new Error(`resolveSeekerProfileId: ${error.message}`);
  }
  return data ? (data.id as string) : null;
}

export interface SeekerInvite {
  readonly id: string;
  readonly listingId: string;
  readonly hostProfileId: string;
  readonly status: string;
  readonly message: string | null;
  readonly createdAt: string;
  readonly expiresAt: string | null;
}

export interface InviteListing {
  readonly id: string;
  readonly title: string;
  readonly category: OpportunityCategory;
  readonly location: string;
  readonly opportunityWindow: string;
  readonly status: ListingStatus;
  readonly host: { readonly name: string; readonly verified: boolean };
  readonly benefits: BenefitTriad;
}

export interface InviteWithListing {
  readonly invite: SeekerInvite;
  readonly listing: InviteListing | null;
}

export type InviteResponse = "accepted" | "declined";

function firstOf(value: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === "object"
    ? (candidate as Record<string, unknown>)
    : null;
}

// Compensation + window strings via the shared, locale-ready formatters
// (the formatter supplies the default currency when the row carries none) \u2014 no
// inline currency/date formatting in the DB layer. See contracts format.ts.
function embeddedCompensationSummary(row: Record<string, unknown>): string {
  return formatCompensation({
    summary:
      typeof row.compensation_summary === "string"
        ? row.compensation_summary
        : null,
    minCents:
      typeof row.compensation_min_cents === "number"
        ? row.compensation_min_cents
        : null,
    maxCents:
      typeof row.compensation_max_cents === "number"
        ? row.compensation_max_cents
        : null,
    unit:
      typeof row.compensation_unit === "string" ? row.compensation_unit : null,
    currency:
      typeof row.compensation_currency === "string"
        ? row.compensation_currency
        : null,
  });
}

function embeddedOpportunityWindow(row: Record<string, unknown>): string {
  return formatOpportunityWindow({
    timelineSummary:
      typeof row.timeline_summary === "string" ? row.timeline_summary : null,
  });
}

function rowToInviteListing(
  listingValue: unknown,
  hostValue: unknown,
): InviteListing | null {
  const row = firstOf(listingValue);
  if (!row) {
    return null;
  }
  const host = firstOf(hostValue);
  const hostName =
    host && typeof host.company_name === "string" && host.company_name.length > 0
      ? host.company_name
      : "Unknown Host";
  const verified =
    host != null && hasVerifiedHostSubscription(host.subscription_tier);

  const housingProvision: BenefitProvision =
    row.housing_included === true ? "provided" : "not_provided";
  const mealsProvision: BenefitProvision =
    row.meals_included === true ? "provided" : "not_provided";

  const benefits: BenefitTriad = {
    housing: { provision: housingProvision },
    meals: { provision: mealsProvision },
    pay: {
      provision: "provided",
      summary: embeddedCompensationSummary(row),
    },
  };

  return {
    id: String(row.id),
    title: typeof row.title === "string" ? row.title : "",
    category: (typeof row.category === "string"
      ? row.category
      : "mix") as OpportunityCategory,
    location:
      typeof row.location_display === "string" &&
      row.location_display.length > 0
        ? row.location_display
        : "Location not specified",
    opportunityWindow: embeddedOpportunityWindow(row),
    status: (typeof row.status === "string"
      ? row.status
      : "live") as ListingStatus,
    host: { name: hostName, verified },
    benefits,
  };
}

const INVITE_SELECT =
  "id, listing_id, host_profile_id, status, message, created_at, expires_at, " +
  "listings!listing_id(id, title, category, location_display, status, housing_included, meals_included, compensation_summary, compensation_min_cents, compensation_max_cents, compensation_unit, compensation_currency, timeline_summary), " +
  "host_profiles!host_profile_id(company_name, subscription_tier)";

export async function getSeekerInvites(
  clerkToken: string,
  clerkUserId: string,
): Promise<InviteWithListing[]> {
  const seekerProfileId = await resolveSeekerProfileId(clerkToken, clerkUserId);
  if (!seekerProfileId) {
    return [];
  }
  if (!DISCOVERY_UUID_RE.test(seekerProfileId)) {
    throw new Error("getSeekerInvites: invalid seeker profile identity");
  }

  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;
  const service = adminClient() as unknown as SupabaseClient;
  const nowIso = new Date().toISOString();
  // Migration 094 intentionally hides `created` invitations from direct
  // authenticated reads. Resolve ownership with the JWT above, then let the
  // service-only delivery authority discover/stamp candidates before the final
  // authenticated read exposes only delivered/viewed rows.
  const { data: candidateData, error: candidateError } = await service
    .from("invites")
    .select("id")
    .eq("seeker_profile_id", seekerProfileId)
    .not("status", "in", '("withdrawn","expired","ignored","applied")')
    .not("expires_at", "is", null)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false });

  if (candidateError) {
    throw new Error(`getSeekerInvites: ${candidateError.message}`);
  }

  const candidateIds: string[] = [];
  for (const raw of candidateData ?? []) {
    const id = (raw as Record<string, unknown>).id;
    if (typeof id !== "string" || !DISCOVERY_UUID_RE.test(id)) {
      throw new Error("getSeekerInvites: invalid invite identity");
    }
    candidateIds.push(id);
  }
  if (candidateIds.length === 0) return [];

  const delivered = await deliverSeekerInvites(seekerProfileId, candidateIds);
  if (delivered.size === 0) return [];

  // Re-read only the rows the locked delivery transaction authorized. If a
  // host withdrawal won before delivery, that id was not returned. If a host
  // withdraws after delivery, this final active-state read omits it and no
  // stale pre-withdraw snapshot is rendered.
  const { data, error } = await untyped
    .from("invites")
    .select(INVITE_SELECT)
    .eq("seeker_profile_id", seekerProfileId)
    .in("id", [...delivered.keys()])
    .not("status", "in", '("withdrawn","expired","ignored","applied")')
    .not("expires_at", "is", null)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`getSeekerInvites: ${error.message}`);

  const now = Date.parse(nowIso);
  const rows = (data ?? [])
    .map((raw) => raw as unknown as Record<string, unknown>)
    .filter((row) => {
      const id = typeof row.id === "string" ? row.id : "";
      const status = typeof row.status === "string" ? row.status : "";
      const expiresAt =
        typeof row.expires_at === "string"
          ? Date.parse(row.expires_at)
          : Number.NaN;
      return (
        delivered.has(id) &&
        (status === "delivered" || status === "viewed") &&
        Number.isFinite(expiresAt) &&
        expiresAt > now
      );
    });

  return rows.map((r) => {
    const status = typeof r.status === "string" ? r.status : "delivered";
    return {
      invite: {
        id: String(r.id),
        listingId: String(r.listing_id),
        hostProfileId: String(r.host_profile_id),
        status,
        message: typeof r.message === "string" ? r.message : null,
        createdAt: typeof r.created_at === "string" ? r.created_at : "",
        expiresAt: typeof r.expires_at === "string" ? r.expires_at : null,
      },
      listing: rowToInviteListing(r.listings, r.host_profiles),
    } satisfies InviteWithListing;
  });
}

const INVITE_DELIVERY_BATCH = 100;

/**
 * Atomically establish the recipient-visible delivery fact before rendering.
 * Migration 094 locks each owned row, stamps only future actionable invites,
 * and returns only rows that remain delivered/viewed. Any authority or payload
 * fault fails closed so a seeker is never shown an invite whose host can still
 * receive an "undelivered" credit refund. The DB-first release deliberately
 * has no legacy delivery fallback.
 */
async function deliverSeekerInvites(
  seekerProfileId: string,
  inviteIds: readonly string[],
): Promise<ReadonlyMap<string, "delivered" | "viewed">> {
  const delivered = new Map<string, "delivered" | "viewed">();
  const admin = adminClient() as unknown as SupabaseClient;

  for (let offset = 0; offset < inviteIds.length; offset += INVITE_DELIVERY_BATCH) {
    const batch = inviteIds.slice(offset, offset + INVITE_DELIVERY_BATCH);
    const batchSet = new Set(batch);
    if (batchSet.size !== batch.length) {
      throw new Error("getSeekerInvites: duplicate invite identity");
    }
    const response = await admin.rpc("deliver_seeker_invites", {
      p_seeker_profile_id: seekerProfileId,
      p_invite_ids: batch,
    });
    if (response.error) {
      throw new Error("getSeekerInvites: delivery authority unavailable");
    }
    const data = response.data;
    if (!Array.isArray(data)) {
      throw new Error("getSeekerInvites: delivery authority unavailable");
    }
    for (const raw of data) {
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        throw new Error("getSeekerInvites: invalid delivery response");
      }
      const row = raw as Record<string, unknown>;
      const id = row.invite_id;
      const status = row.status;
      if (
        typeof id !== "string" ||
        !batchSet.has(id) ||
        delivered.has(id) ||
        (status !== "delivered" && status !== "viewed")
      ) {
        throw new Error("getSeekerInvites: invalid delivery response");
      }
      delivered.set(id, status);
    }
  }

  return delivered;
}

const RESPONSE_TARGET: Record<InviteResponse, "applied" | "ignored"> = {
  accepted: "applied",
  declined: "ignored",
};

const LIVE_INVITE_STATES = new Set(["created", "delivered", "viewed"]);

function invitePath(
  from: string,
  target: "applied" | "ignored",
): string[] | null {
  if (!LIVE_INVITE_STATES.has(from)) {
    return null;
  }
  if (target === "ignored") {
    return ["ignored"];
  }
  return from === "created" ? ["delivered", "applied"] : ["applied"];
}

/**
 * Seeker responds to an invite they received.
 *
 * ACCEPTING AN INVITE CREATES A REAL APPLICATION. Before this, accept only
 * walked the invite row to 'applied' — no applications row was ever created,
 * so the host was told someone accepted and found an EMPTY /host/applicants.
 * applyToListing delegates acceptance to submit_my_application, which creates
 * or reactivates the application AND advances/links the invite atomically. The
 * deployment bridge is the sole exception: when PostgREST proves that RPC is
 * not deployed yet, this function completes the prior status/linkage sequence.
 * If submission is refused (e.g. `resume_incomplete`), the invite stays
 * actionable so the seeker can finish their résumé and accept again — an
 * invite is a request to apply, never a bypass of the résumé requirement.
 *
 * On success the result carries the applicationId so the action layer can
 * anchor the host's application_submitted notification to a real row.
 */
export async function respondToInvite(
  clerkToken: string,
  clerkUserId: string,
  inviteId: string,
  response: InviteResponse,
): Promise<{
  ok: boolean;
  error?: string;
  applicationId?: string;
  listingId?: string;
  disposition?: NonNullable<ApplyResult["disposition"]>;
}> {
  const target = RESPONSE_TARGET[response];
  if (!target) {
    return { ok: false, error: "invalid_response" };
  }

  const seekerProfileId = await resolveSeekerProfileId(clerkToken, clerkUserId);
  if (!seekerProfileId) {
    return { ok: false, error: "profile_not_found" };
  }

  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;

  const { data: inviteRow, error: loadError } = await untyped
    .from("invites")
    .select("id, status, listing_id, application_id, expires_at")
    .eq("id", inviteId)
    .eq("seeker_profile_id", seekerProfileId)
    .maybeSingle();
  if (loadError) {
    return { ok: false, error: "temporarily_unavailable" };
  }
  if (!inviteRow) {
    return { ok: false, error: "not_found" };
  }

  const row = inviteRow as Record<string, unknown>;
  const current = typeof row.status === "string" ? String(row.status) : "";
  const listingId = typeof row.listing_id === "string" ? row.listing_id : "";

  if (current === target) {
    // Already responded — idempotent, and report the linked application (if
    // any) so a retried accept still resolves to the same row.
    return {
      ok: true,
      ...(typeof row.application_id === "string"
        ? { applicationId: row.application_id }
        : {}),
      ...(listingId ? { listingId } : {}),
    };
  }

  const path = invitePath(current, target);
  if (!path) {
    return { ok: false, error: "already_responded" };
  }

  let applicationId: string | undefined;
  let disposition: NonNullable<ApplyResult["disposition"]> | undefined;

  // ── Accept: the RPC owns application + invite mutation atomically ────────
  if (target === "applied") {
    if (!listingId) {
      return { ok: false, error: "not_found" };
    }
    const expiresAt =
      typeof row.expires_at === "string" ? Date.parse(row.expires_at) : NaN;
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return { ok: false, error: "invite_not_actionable" };
    }
    const applied = await applyToListing(clerkToken, clerkUserId, listingId, undefined, {
      source: "invite",
      originInviteId: inviteId,
    });
    const recoverableLegacyDuplicate =
      applied.legacySubmission === true &&
      applied.error === "already_applied" &&
      typeof applied.applicationId === "string";
    if (!applied.ok && !recoverableLegacyDuplicate) {
      return { ok: false, error: applied.error };
    }

    applicationId = applied.applicationId;
    disposition = applied.disposition;

    if (!applied.legacySubmission) {
      return {
        ok: true,
        ...(applicationId ? { applicationId } : {}),
        ...(listingId ? { listingId } : {}),
        ...(disposition ? { disposition } : {}),
      };
    }

    // Only the positively identified pre-091 bridge reaches this point. The
    // RPC path already committed these writes and must never duplicate them.
  }

  // Decline remains the existing seeker-scoped invite status transition.
  for (const next of path) {
    const { data: updated, error: updateError } = await untyped
      .from("invites")
      .update({ status: next })
      .eq("id", inviteId)
      .eq("seeker_profile_id", seekerProfileId)
      .select("id")
      .maybeSingle();
    if (updateError) {
      return { ok: false, error: "temporarily_unavailable" };
    }
    // Affected-row assertion: a zero-row UPDATE (concurrent response/withdraw
    // or an RLS filter — the write policy ships in migration 066) must never
    // report a response the database did not record.
    if (!updated) {
      return { ok: false, error: "conflict" };
    }
  }

  // Declines and the positively identified pre-091 acceptance bridge still use
  // table grants, so the server stamps response/linkage facts via service role.
  // Authoritative RPC acceptances returned above and never reach this call.
  await stampInviteResponse(inviteId, applicationId);

  return {
    ok: true,
    ...(applicationId ? { applicationId } : {}),
    ...(listingId ? { listingId } : {}),
    ...(disposition ? { disposition } : {}),
  };
}

/**
 * Stamp responded_at and optional legacy-acceptance linkage through the
 * service role. Best-effort by design: never throws, never fails the caller.
 */
async function stampInviteResponse(
  inviteId: string,
  applicationId?: string,
): Promise<void> {
  try {
    await (adminClient() as unknown as SupabaseClient)
      .from("invites")
      .update({
        responded_at: new Date().toISOString(),
        ...(applicationId ? { application_id: applicationId } : {}),
      })
      .eq("id", inviteId);
  } catch {
    // Response/linkage metadata is best-effort; the status is already durable.
  }
}

// ---------------------------------------------------------------------------
// Host-side invite functions
// ---------------------------------------------------------------------------

async function resolveHostProfileId(
  clerkToken: string,
  clerkUserId: string,
): Promise<string | null> {
  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data, error } = await untyped
    .from("host_profiles")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (error) {
    throw new Error(`resolveHostProfileId: ${error.message}`);
  }
  return data ? String((data as Record<string, unknown>).id) : null;
}

export type WithdrawInviteResult =
  | {
      readonly ok: true;
      readonly disposition: "withdrawn" | "already_withdrawn";
      readonly creditRestored: boolean;
    }
  | {
      readonly ok: false;
      readonly error:
        | "invalid_request"
        | "invite_not_withdrawable"
        | "invite_delivery_in_progress"
        | "invite_authority_rollout_draining"
        | "temporarily_unavailable";
    };

/**
 * Host retracts a pending invite through migration 094's service-only RPC.
 * Status change and any pre-delivery-processing credit restore are one transaction;
 * an outage can no longer commit one without the other. The authenticated
 * client proves the caller's host profile before the service RPC rechecks it.
 */
export async function withdrawInvite(
  clerkToken: string,
  clerkUserId: string,
  inviteId: string,
): Promise<WithdrawInviteResult> {
  if (!DISCOVERY_UUID_RE.test(inviteId)) {
    return { ok: false, error: "invalid_request" };
  }
  const normalizedInviteId = inviteId.toLowerCase();

  try {
    const hostProfileId = await resolveHostProfileId(clerkToken, clerkUserId);
    if (!hostProfileId || !DISCOVERY_UUID_RE.test(hostProfileId)) {
      return { ok: false, error: "invite_not_withdrawable" };
    }

    const admin = adminClient() as unknown as SupabaseClient;
    const { data, error } = await admin.rpc("withdraw_host_invite", {
      p_host_profile_id: hostProfileId,
      p_invite_id: normalizedInviteId,
    });
    if (error || typeof data !== "object" || data === null || Array.isArray(data)) {
      return { ok: false, error: "temporarily_unavailable" };
    }

    const result = data as Record<string, unknown>;
    if (result.ok !== true) {
      return result.error === "invalid_request" ||
        result.error === "invite_not_withdrawable" ||
        result.error === "invite_delivery_in_progress" ||
        result.error === "invite_authority_rollout_draining"
        ? { ok: false, error: result.error }
        : { ok: false, error: "temporarily_unavailable" };
    }
    if (
      typeof result.invite_id !== "string" ||
      result.invite_id.toLowerCase() !== normalizedInviteId ||
      (result.disposition !== "withdrawn" &&
        result.disposition !== "already_withdrawn") ||
      typeof result.credit_restored !== "boolean"
    ) {
      return { ok: false, error: "temporarily_unavailable" };
    }
    return {
      ok: true,
      disposition: result.disposition,
      creditRestored: result.credit_restored,
    };
  } catch {
    return { ok: false, error: "temporarily_unavailable" };
  }
}

const DISCOVERY_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEEKER_SEARCH_LIMIT = 20;

export type HostDiscoveryError =
  | "invalid_request"
  | "listing_unavailable"
  | "temporarily_unavailable";

export interface SeekerSearchResult {
  readonly seekerProfileId: string;
  readonly displayName: string | null;
  readonly bio: string | null;
  readonly alreadyInvited: boolean;
}

export type SeekerSearchLoadResult =
  | { readonly ok: true; readonly seekers: readonly SeekerSearchResult[] }
  | { readonly ok: false; readonly error: HostDiscoveryError };

function normalizeSearchQuery(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function discoveryRpcError(error: unknown): HostDiscoveryError {
  if (typeof error !== "object" || error === null) {
    return "temporarily_unavailable";
  }
  const record = error as Record<string, unknown>;
  const message = typeof record.message === "string" ? record.message : "";

  if (message === "invalid_request") return "invalid_request";
  if (message === "listing_unavailable") return "listing_unavailable";
  return "temporarily_unavailable";
}

function decodeSeekerSearchRow(raw: unknown): SeekerSearchResult | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (
    typeof row.seeker_profile_id !== "string" ||
    !DISCOVERY_UUID_RE.test(row.seeker_profile_id) ||
    (row.display_name !== null && typeof row.display_name !== "string") ||
    (row.short_bio !== null && typeof row.short_bio !== "string") ||
    typeof row.already_invited !== "boolean"
  ) {
    return null;
  }

  const displayName = row.display_name?.trim() || null;
  const bio = row.short_bio?.trim() || null;
  return {
    seekerProfileId: row.seeker_profile_id,
    displayName,
    bio,
    alreadyInvited: row.already_invited,
  };
}

async function resolveEligibleOwnedDiscoveryListing(
  clerkToken: string,
  clerkUserId: string,
  listingId: string,
): Promise<
  | { readonly ok: true; readonly hostProfileId: string }
  | { readonly ok: false; readonly error: HostDiscoveryError }
> {
  const hostProfileId = await resolveHostProfileId(clerkToken, clerkUserId);
  if (!hostProfileId) return { ok: false, error: "listing_unavailable" };
  if (!DISCOVERY_UUID_RE.test(hostProfileId)) {
    return { ok: false, error: "temporarily_unavailable" };
  }

  const db = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data, error } = await db
    .from("listings")
    .select("id")
    .eq("id", listingId)
    .eq("host_profile_id", hostProfileId)
    .eq("status", "live")
    .eq("provenance", "verified")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) return { ok: false, error: "temporarily_unavailable" };
  if (!data) return { ok: false, error: "listing_unavailable" };
  const row = data as Record<string, unknown>;
  if (row.id !== listingId) {
    return { ok: false, error: "temporarily_unavailable" };
  }
  return { ok: true, hostProfileId };
}

export async function searchSeekersForInvite(
  clerkToken: string,
  clerkUserId: string,
  listingId: string,
  query: string,
): Promise<SeekerSearchLoadResult> {
  const normalizedQuery = normalizeSearchQuery(query);
  if (
    !DISCOVERY_UUID_RE.test(listingId) ||
    normalizedQuery.length < 2 ||
    normalizedQuery.length > 100
  ) {
    return { ok: false, error: "invalid_request" };
  }

  try {
    const eligible = await resolveEligibleOwnedDiscoveryListing(
      clerkToken,
      clerkUserId,
      listingId,
    );
    if (!eligible.ok) return eligible;

    const admin = adminClient() as unknown as SupabaseClient;
    const { data, error } = await admin.rpc("search_host_sourceable_seekers", {
      p_host_profile_id: eligible.hostProfileId,
      p_listing_id: listingId,
      p_query: normalizedQuery,
      p_limit: SEEKER_SEARCH_LIMIT,
    });
    if (error) return { ok: false, error: discoveryRpcError(error) };
    if (!Array.isArray(data)) {
      return { ok: false, error: "temporarily_unavailable" };
    }

    const seekers: SeekerSearchResult[] = [];
    for (const raw of data) {
      const seeker = decodeSeekerSearchRow(raw);
      if (!seeker) return { ok: false, error: "temporarily_unavailable" };
      seekers.push(seeker);
    }
    return { ok: true, seekers };
  } catch {
    return { ok: false, error: "temporarily_unavailable" };
  }
}

export interface HostInvite {
  readonly id: string;
  readonly listingId: string;
  readonly listingTitle: string;
  readonly seekerProfileId: string;
  readonly seekerDisplayName: string | null;
  readonly status: string;
  readonly message: string | null;
  readonly createdAt: string;
  /** Durable recipient-list delivery fact; never inferred from current status. */
  readonly deliveredAt: string | null;
}

export async function getHostInvites(
  clerkToken: string,
  clerkUserId: string,
): Promise<HostInvite[]> {
  const hostProfileId = await resolveHostProfileId(clerkToken, clerkUserId);
  if (!hostProfileId) {
    return [];
  }

  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;

  const { data, error } = await untyped
    .from("invites")
    .select(
      "id, listing_id, seeker_profile_id, status, message, created_at, delivered_at, " +
        "listings!listing_id(title)",
    )
    .eq("host_profile_id", hostProfileId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`getHostInvites: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  const displayNames = await getSeekerDisplayNames(
    clerkToken,
    rows.map((row) => String(row.seeker_profile_id)),
  );

  return rows.map((raw) => {
    const r = raw as unknown as Record<string, unknown>;
    const listing = firstOf(r.listings);
    const seekerProfileId = String(r.seeker_profile_id);
    return {
      id: String(r.id),
      listingId: String(r.listing_id),
      listingTitle:
        listing && typeof listing.title === "string" ? listing.title : "",
      seekerProfileId,
      seekerDisplayName: resolveSeekerName(
        displayNames,
        seekerProfileId,
        "Anonymous seeker",
      ),
      status: typeof r.status === "string" ? r.status : "created",
      message: typeof r.message === "string" ? r.message : null,
      createdAt: typeof r.created_at === "string" ? r.created_at : "",
      deliveredAt:
        typeof r.delivered_at === "string" ? r.delivered_at : null,
    } satisfies HostInvite;
  });
}

/** Postgres unique_violation SQLSTATE — surfaced as the already-invited case. */
const UNIQUE_VIOLATION_INVITE = "23505";

export interface CreateInviteParams {
  readonly hostProfileId: string;
  readonly seekerProfileId: string;
  readonly listingId: string;
  readonly message?: string;
  readonly invitedByUserId?: string;
}

/**
 * Create a host-initiated invite. Status always starts at `created` because the
 * current invite lifecycle constraint rejects non-seeded values such as
 * `pending`.
 *
 * Ownership is validated in the server action before calling this function.
 * Deduplication: a unique violation on (listing_id, seeker_profile_id)
 * is returned as `{ ok: false, error: "already_invited" }`.
 */
export async function createInvite(
  clerkToken: string,
  params: CreateInviteParams,
): Promise<{ ok: boolean; inviteId?: string; error?: string }> {
  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;
  const trimmedMessage =
    typeof params.message === "string" && params.message.trim().length > 0
      ? params.message.trim()
      : null;

  const { data, error } = await untyped
    .from("invites")
    .insert({
      listing_id: params.listingId,
      host_profile_id: params.hostProfileId,
      seeker_profile_id: params.seekerProfileId,
      status: "created",
      ...(params.invitedByUserId ? { invited_by_user_id: params.invitedByUserId } : {}),
      ...(trimmedMessage !== null ? { message: trimmedMessage } : {}),
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION_INVITE) {
      return { ok: false, error: "already_invited" };
    }
    return { ok: false, error: error.message };
  }

  return { ok: true, inviteId: String((data as Record<string, unknown>).id) };
}
