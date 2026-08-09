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
import { applyToListing, type ApplyResult } from "./applications";

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

  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;
  const nowIso = new Date().toISOString();
  const { data, error } = await untyped
    .from("invites")
    .select(INVITE_SELECT)
    .eq("seeker_profile_id", seekerProfileId)
    .not("status", "in", '("withdrawn","expired","ignored","applied")')
    .not("expires_at", "is", null)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`getSeekerInvites: ${error.message}`);
  }

  const now = Date.parse(nowIso);
  const rows = (data ?? [])
    .map((raw) => raw as unknown as Record<string, unknown>)
    .filter((row) => {
      const expiresAt =
        typeof row.expires_at === "string"
          ? Date.parse(row.expires_at)
          : Number.NaN;
      return Number.isFinite(expiresAt) && expiresAt > now;
    });

  // Reaching the seeker's own list IS delivery — stamp the 'created' ones so
  // the host's credit-restore rule (undelivered only) tells the truth. Awaited
  // but non-throwing, so the returned statuses match what was just written.
  await markInvitesDelivered(
    rows.filter((r) => r.status === "created").map((r) => String(r.id)),
  );

  return rows.map((r) => {
    const status = typeof r.status === "string" ? r.status : "created";
    return {
      invite: {
        id: String(r.id),
        listingId: String(r.listing_id),
        hostProfileId: String(r.host_profile_id),
        // Reflect the delivery we just stamped rather than the pre-write read.
        status: status === "created" ? "delivered" : status,
        message: typeof r.message === "string" ? r.message : null,
        createdAt: typeof r.created_at === "string" ? r.created_at : "",
        expiresAt: typeof r.expires_at === "string" ? r.expires_at : null,
      },
      listing: rowToInviteListing(r.listings, r.host_profiles),
    } satisfies InviteWithListing;
  });
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

/**
 * Mark invites as DELIVERED once they have actually reached the seeker.
 *
 * The invite lifecycle promises created -> delivered -> viewed -> applied, but
 * nothing ever advanced past 'created': delivered_at/viewed_at were never
 * written. That made withdrawInvite's `wasUndelivered` — which decides whether
 * the host's invite credit is restored — permanently TRUE, so every withdrawal
 * refunded a credit even for invites the seeker had already seen.
 *
 * Fetching the seeker's own invite list IS delivery: the invite is now in the
 * recipient's hands. Stamped through the service role (a system fact, not a
 * seeker action) and best-effort: a stamping failure must never break the
 * seeker's invite list. Only 'created' rows are touched, so the common path
 * writes nothing.
 *
 * FOUNDER POLICY (2026-07-16): invite credits are restored ONLY for invites
 * that were never delivered. This function is what makes that honest.
 */
async function markInvitesDelivered(inviteIds: readonly string[]): Promise<void> {
  if (inviteIds.length === 0) return;
  try {
    await (adminClient() as unknown as SupabaseClient)
      .from("invites")
      .update({ status: "delivered", delivered_at: new Date().toISOString() })
      .in("id", [...inviteIds])
      // Status-scoped: a concurrent withdraw/response is never clobbered, and
      // 'created' -> 'delivered' is a seeded lifecycle edge (001).
      .eq("status", "created");
  } catch {
    // Delivery stamping is best-effort; the list render is what matters.
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

export type WithdrawInviteResult = {
  ok: boolean;
  error?: string;
  /**
   * True iff the invite was status 'created' (never delivered) AT THE MOMENT
   * the withdraw UPDATE matched — derived from the update itself, not a prior
   * read, so callers can safely key credit restoration off it (no TOCTOU).
   *
   * FOUNDER POLICY (2026-07-16): the host's invite credit is restored ONLY
   * when the invite never reached the seeker. This flag now means what it
   * says: delivery is stamped for real (markInvitesDelivered) the moment an
   * invite reaches the seeker's list. Previously nothing ever advanced past
   * 'created', so this was permanently true and EVERY withdrawal refunded a
   * credit — including invites the seeker had already read.
   */
  wasUndelivered?: boolean;
};

/**
 * Host retracts a still-pending invite (created/delivered/viewed → withdrawn),
 * scoped to the caller's own host profile. A no-op match — already actioned,
 * expired, or not owned — returns ok:false so the UI can explain why.
 *
 * Two-step conditional update: the strictly-'created' UPDATE runs first; only
 * if it matched nothing do the delivered/viewed states get withdrawn. Each
 * UPDATE's WHERE is atomic, so `wasUndelivered` is exact even when the seeker
 * responds concurrently (the invite-credit restore policy depends on this).
 * `clerkUserId` MUST come from auth().userId (never decoded from the token).
 */
export async function withdrawInvite(
  clerkToken: string,
  clerkUserId: string,
  inviteId: string,
): Promise<WithdrawInviteResult> {
  if (!inviteId) return { ok: false, error: "Missing invite id." };

  const hostProfileId = await resolveHostProfileId(clerkToken, clerkUserId);
  if (!hostProfileId) {
    return { ok: false, error: "No host profile found for your account." };
  }

  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;

  const created = await untyped
    .from("invites")
    .update({ status: "withdrawn" })
    .eq("id", inviteId)
    .eq("host_profile_id", hostProfileId)
    .eq("status", "created")
    .select("id")
    .maybeSingle();
  if (created.error) return { ok: false, error: created.error.message };
  if (created.data) return { ok: true, wasUndelivered: true };

  const { data, error } = await untyped
    .from("invites")
    .update({ status: "withdrawn" })
    .eq("id", inviteId)
    .eq("host_profile_id", hostProfileId)
    .in("status", ["delivered", "viewed"])
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "That invite can no longer be withdrawn." };
  return { ok: true, wasUndelivered: false };
}

function sanitizeSearchQuery(raw: string): string {
  return raw.slice(0, 100).replace(/[,()*%]/g, " ").replace(/\s+/g, " ").trim();
}

export interface SeekerSearchResult {
  readonly seekerProfileId: string;
  readonly displayName: string | null;
  readonly bio: string | null;
}

export async function searchSeekersForInvite(
  clerkToken: string,
  clerkUserId: string,
  query: string,
): Promise<SeekerSearchResult[]> {
  const safe = sanitizeSearchQuery(query);
  if (safe.length === 0) {
    return [];
  }

  const hostProfileId = await resolveHostProfileId(clerkToken, clerkUserId);
  if (!hostProfileId) {
    return [];
  }

  const pattern = `%${safe}%`;
  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;

  const [nameRes, bioRes] = await Promise.all([
    untyped
      .from("seeker_profiles")
      .select("id, display_name, short_bio")
      .ilike("display_name", pattern)
      .limit(20),
    untyped
      .from("seeker_profiles")
      .select("id, display_name, short_bio")
      .ilike("short_bio", pattern)
      .limit(20),
  ]);

  if (nameRes.error && bioRes.error) {
    return [];
  }

  const seen = new Set<string>();
  const merged: Array<Record<string, unknown>> = [];
  for (const row of [
    ...((nameRes.data ?? []) as Array<Record<string, unknown>>),
    ...((bioRes.data ?? []) as Array<Record<string, unknown>>),
  ]) {
    const id = String(row.id);
    if (!seen.has(id)) {
      seen.add(id);
      merged.push(row);
    }
  }
  const data = merged.slice(0, 20);

  return data.map((raw) => {
    const r = raw as Record<string, unknown>;
    return {
      seekerProfileId: String(r.id),
      displayName:
        typeof r.display_name === "string" && r.display_name.trim().length > 0
          ? r.display_name.trim()
          : null,
      bio:
        typeof r.short_bio === "string" && r.short_bio.trim().length > 0
          ? r.short_bio.trim()
          : null,
    } satisfies SeekerSearchResult;
  });
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
      "id, listing_id, seeker_profile_id, status, message, created_at, " +
        "listings!listing_id(title), " +
        "seeker_profiles!seeker_profile_id(display_name)",
    )
    .eq("host_profile_id", hostProfileId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`getHostInvites: ${error.message}`);
  }

  return (data ?? []).map((raw) => {
    const r = raw as unknown as Record<string, unknown>;
    const listing = firstOf(r.listings);
    const seeker = firstOf(r.seeker_profiles);
    return {
      id: String(r.id),
      listingId: String(r.listing_id),
      listingTitle:
        listing && typeof listing.title === "string" ? listing.title : "",
      seekerProfileId: String(r.seeker_profile_id),
      seekerDisplayName:
        seeker &&
        typeof seeker.display_name === "string" &&
        seeker.display_name.trim().length > 0
          ? seeker.display_name.trim()
          : null,
      status: typeof r.status === "string" ? r.status : "created",
      message: typeof r.message === "string" ? r.message : null,
      createdAt: typeof r.created_at === "string" ? r.created_at : "",
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
