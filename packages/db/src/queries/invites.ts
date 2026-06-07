import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BenefitProvision,
  BenefitTriad,
  ListingStatus,
  OpportunityCategory,
} from "@explore-and-earn/contracts";

import { authedClient } from "../client";

/*
 * TODO: send inviteReceivedEmail via server action.
 *
 * Host-initiated invite CREATION does not yet have a code path in this module
 * (only seeker-facing reads + respondToInvite live here). When an invite-create
 * mutation lands, the inviteReceivedEmail notification MUST be sent from the
 * server action layer (apps/web/app/actions/*), NOT from inside a DB query
 * function: query functions stay free of transport/side-effects, and the Clerk
 * user lookup needed to resolve the seeker's email is only available in the
 * Next server runtime. See apps/web/lib/emails/inviteReceived.ts for the
 * template and apps/web/app/actions/applications.ts for the established
 * "resolve context in db -> look up email via Clerk -> sendEmail" pattern.
 */

/**
 * Resolve seeker_profiles.id for the authed Clerk user.
 *
 * `clerkUserId` must come from `auth().userId` — never decode it from the token.
 * Re-implemented locally (the identical helper in queries/applications.ts is a
 * private module function, not exported).
 *
 * TYPES BRIDGE: types.gen.ts predates seeker_profiles.clerk_user_id, so the
 * column is read through an untyped client handle until types are regenerated.
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

/**
 * A host invite as the seeker sees it. `status` stays a plain string (the
 * persisted lifecycle vocabulary is broader than any local union).
 */
export interface SeekerInvite {
  readonly id: string;
  readonly listingId: string;
  readonly hostProfileId: string;
  readonly status: string;
  readonly message: string | null;
  /** ISO-8601 creation timestamp. */
  readonly createdAt: string;
}

/**
 * Minimal listing view-model carried alongside an invite. Structurally a subset
 * of the Discovery lane's DiscoveryListing (composed from the frozen
 * @explore-and-earn/contracts registries) so it maps cleanly into LifecycleList
 * / DiscoveryCard WITHOUT importing the frontend type (which would create a
 * packages/db -> apps/web import cycle). Same approach as ApplicationListing,
 * but the host name/verification ARE populated here from the invite's embedded
 * host_profiles row.
 */
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

/**
 * An invite joined to its listing view-model, for the /invites surface.
 * `listing` is null when the embedded listing could not be resolved.
 */
export interface InviteWithListing {
  readonly invite: SeekerInvite;
  readonly listing: InviteListing | null;
}

/** Seeker-facing response verbs accepted by respondToInvite. */
export type InviteResponse = "accepted" | "declined";

function firstOf(value: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === "object"
    ? (candidate as Record<string, unknown>)
    : null;
}

/**
 * Build the card compensation display from the embedded listing fields. Mirrors
 * embeddedCompensationSummary in queries/applications.ts; reads the optional
 * compensation_currency column when present (defaults to USD).
 */
function embeddedCompensationSummary(row: Record<string, unknown>): string {
  if (
    typeof row.compensation_summary === "string" &&
    row.compensation_summary.length > 0
  ) {
    return row.compensation_summary;
  }
  const minCents =
    typeof row.compensation_min_cents === "number"
      ? row.compensation_min_cents
      : null;
  if (minCents != null) {
    const unit =
      typeof row.compensation_unit === "string"
        ? row.compensation_unit
        : "other";
    const currency =
      typeof row.compensation_currency === "string"
        ? row.compensation_currency
        : "USD";
    const fmt = (cents: number) =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(cents / 100);
    const min = fmt(minCents);
    const maxCents =
      typeof row.compensation_max_cents === "number"
        ? row.compensation_max_cents
        : null;
    const max = maxCents != null ? fmt(maxCents) : null;
    const range = max && max !== min ? `${min}\u2013${max}` : min;
    return unit === "other" || unit === "exchange" || unit === "stipend"
      ? range
      : `${range}/${unit}`;
  }
  return "Negotiable";
}

/** Opportunity window display, mirroring the listings query fallbacks. */
function embeddedOpportunityWindow(row: Record<string, unknown>): string {
  if (
    typeof row.timeline_summary === "string" &&
    row.timeline_summary.length > 0
  ) {
    return row.timeline_summary;
  }
  return "Open";
}

/**
 * Map the embedded `listings` row + `host_profiles` row to InviteListing.
 * Returns null when the listing embed is absent (e.g. a deleted listing).
 */
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
  // Mirrors rowToDiscoveryFields in queries/listings.ts (verified === attested).
  const verified =
    host != null && host.attestation_status === "verified";

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

/**
 * Embedded-join select: the invite plus its listing view-model fields and the
 * inviting host's company name. `table!fk_column` disambiguates the FK path
 * (same pattern as queries/applications.ts).
 */
const INVITE_SELECT =
  "id, listing_id, host_profile_id, status, message, created_at, " +
  "listings!listing_id(id, title, category, location_display, status, housing_included, meals_included, compensation_summary, compensation_min_cents, compensation_max_cents, compensation_unit, compensation_currency, timeline_summary), " +
  "host_profiles!host_profile_id(company_name, attestation_status)";

/**
 * All non-withdrawn invites for the authed seeker, newest first, each joined to
 * its listing view-model and inviting host.
 *
 * `clerkUserId` MUST come from auth().userId — never decoded from the token.
 * App-level ownership guard only (RLS is gated to a separate change): every
 * query is scoped by the resolved seeker_profile_id. UNTYPED-client bridge
 * because the invites table predates the committed types.gen.ts.
 *
 * Returns an empty array when the seeker has no profile yet or no invites.
 */
export async function getSeekerInvites(
  clerkToken: string,
  clerkUserId: string,
): Promise<InviteWithListing[]> {
  const seekerProfileId = await resolveSeekerProfileId(clerkToken, clerkUserId);
  if (!seekerProfileId) {
    return [];
  }

  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data, error } = await untyped
    .from("invites")
    .select(INVITE_SELECT)
    .eq("seeker_profile_id", seekerProfileId)
    .neq("status", "withdrawn")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`getSeekerInvites: ${error.message}`);
  }

  return (data ?? []).map((raw) => {
    const r = raw as unknown as Record<string, unknown>;
    return {
      invite: {
        id: String(r.id),
        listingId: String(r.listing_id),
        hostProfileId: String(r.host_profile_id),
        status: typeof r.status === "string" ? r.status : "created",
        message: typeof r.message === "string" ? r.message : null,
        createdAt: typeof r.created_at === "string" ? r.created_at : "",
      },
      listing: rowToInviteListing(r.listings, r.host_profiles),
    } satisfies InviteWithListing;
  });
}

/**
 * Persisted target for each seeker-facing response verb.
 *
 * IMPORTANT: invites.status has NO 'accepted'/'declined' values. Migration 007
 * constrains status to (created, delivered, viewed, applied, ignored, expired,
 * withdrawn), and migration 001's enforce_lifecycle_transition('invite',...)
 * trigger rejects illegal hops. So accept -> 'applied' and decline -> 'ignored'
 * (analogous to the host/seeker status-vocabulary split in applications.ts).
 */
const RESPONSE_TARGET: Record<InviteResponse, "applied" | "ignored"> = {
  accepted: "applied",
  declined: "ignored",
};

/** Invite states from which a seeker can still respond (seeded in migration 001). */
const LIVE_INVITE_STATES = new Set(["created", "delivered", "viewed"]);

/**
 * Ordered list of valid lifecycle hops to move `from` to `target`, or null when
 * no legal path exists.
 *
 * Seeded invite transitions (migration 001):
 *   created   -> delivered | viewed* | withdrawn | expired | ignored
 *   delivered -> viewed | applied | withdrawn | expired | ignored
 *   viewed    -> applied | withdrawn | expired | ignored
 * (*viewed is reachable from delivered.) 'applied' is NOT reachable directly
 * from 'created', so a 'created' invite is first advanced to 'delivered'.
 */
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
 * The authed seeker accepts or declines an invite.
 *
 * `clerkUserId` MUST come from auth().userId — never decoded from the token.
 * App-level ownership guard only: the invite is scoped by id + the resolved
 * seeker_profile_id. The seeker-facing verb is mapped to its persisted lifecycle
 * value and applied through valid transitions (see RESPONSE_TARGET / invitePath).
 *
 * Business outcomes are returned as a typed result rather than thrown:
 * - `profile_not_found`  — no seeker_profiles row yet
 * - `not_found`          — no matching invite owned by this seeker
 * - `already_responded`  — invite is no longer in a respondable state
 */
export async function respondToInvite(
  clerkToken: string,
  clerkUserId: string,
  inviteId: string,
  response: InviteResponse,
): Promise<{ ok: boolean; error?: string }> {
  const target = RESPONSE_TARGET[response];
  if (!target) {
    return { ok: false, error: "invalid_response" };
  }

  const seekerProfileId = await resolveSeekerProfileId(clerkToken, clerkUserId);
  if (!seekerProfileId) {
    return { ok: false, error: "profile_not_found" };
  }

  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;

  // Load current status, scoped to the authed seeker (ownership guard).
  const { data: inviteRow, error: loadError } = await untyped
    .from("invites")
    .select("id, status")
    .eq("id", inviteId)
    .eq("seeker_profile_id", seekerProfileId)
    .maybeSingle();
  if (loadError) {
    return { ok: false, error: loadError.message };
  }
  if (!inviteRow) {
    return { ok: false, error: "not_found" };
  }

  const current =
    typeof (inviteRow as Record<string, unknown>).status === "string"
      ? String((inviteRow as Record<string, unknown>).status)
      : "";

  // Idempotent: already at the requested terminal state.
  if (current === target) {
    return { ok: true };
  }

  const path = invitePath(current, target);
  if (!path) {
    return { ok: false, error: "already_responded" };
  }

  // Apply each hop in order. The DB lifecycle guard
  // (enforce_lifecycle_transition('invite','status'), migration 001) rejects any
  // illegal hop, so each step here mirrors a seeded INVITE transition.
  for (const next of path) {
    const { error: updateError } = await untyped
      .from("invites")
      .update({ status: next })
      .eq("id", inviteId)
      .eq("seeker_profile_id", seekerProfileId);
    if (updateError) {
      return { ok: false, error: updateError.message };
    }
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Host-side invite functions
// ---------------------------------------------------------------------------

/**
 * Resolve the caller's host_profile_id from their Clerk user id.
 * Returns null when the host has no profile row yet.
 */
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

/** Sanitize a freeform search query for use in a ILIKE pattern. */
function sanitizeSearchQuery(raw: string): string {
  return raw.trim().slice(0, 100).replace(/%/g, "");
}

/** A seeker match returned by the invite search surface. */
export interface SeekerSearchResult {
  readonly seekerProfileId: string;
  readonly displayName: string | null;
  readonly bio: string | null;
}

/**
 * Search seeker profiles by display name or bio for the invite surface.
 *
 * Input is sanitized (trimmed, max 100 chars, `%` stripped). Results capped at
 * 20. Returns empty array when the host has no profile or the query is empty
 * after sanitization.
 *
 * `clerkUserId` MUST come from auth().userId.
 */
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

  const { data, error } = await untyped
    .from("seeker_profiles")
    .select("id, display_name, short_bio")
    .or(`display_name.ilike.${pattern},short_bio.ilike.${pattern}`)
    .limit(20);

  if (error) {
    // Missing-column fallback: display_name may not exist yet.
    return [];
  }

  return (data ?? []).map((raw) => {
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

/** An invite as the host sees it — minimal view-model for the /host/invites surface. */
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

/**
 * All invites sent by the authed host, newest first.
 *
 * `clerkUserId` MUST come from auth().userId.
 * Returns an empty array when the host has no profile or no invites yet.
 */
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

/**
 * Create a host-initiated invite. Status always starts at `created` (the DB
 * lifecycle trigger rejects any other initial value).
 *
 * Ownership guard: the caller must own the listing (via host_profile_id).
 * Deduplication: a unique violation on (listing_id, seeker_profile_id)
 * is returned as `{ ok: false, error: "already_invited" }`.
 *
 * `clerkUserId` MUST come from auth().userId.
 */
export async function createInvite(
  clerkToken: string,
  clerkUserId: string,
  listingId: string,
  seekerProfileId: string,
  message?: string,
): Promise<{ ok: boolean; inviteId?: string; error?: string }> {
  const hostProfileId = await resolveHostProfileId(clerkToken, clerkUserId);
  if (!hostProfileId) {
    return { ok: false, error: "profile_not_found" };
  }

  // Ownership check: confirm the listing belongs to this host.
  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data: listingRow, error: listingError } = await untyped
    .from("listings")
    .select("id")
    .eq("id", listingId)
    .eq("host_profile_id", hostProfileId)
    .maybeSingle();

  if (listingError) {
    return { ok: false, error: listingError.message };
  }
  if (!listingRow) {
    return { ok: false, error: "forbidden" };
  }

  const trimmedMessage =
    typeof message === "string" && message.trim().length > 0
      ? message.trim()
      : null;

  const { data, error } = await untyped
    .from("invites")
    .insert({
      listing_id: listingId,
      host_profile_id: hostProfileId,
      seeker_profile_id: seekerProfileId,
      invited_by_user_id: clerkUserId,
      status: "created",
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
