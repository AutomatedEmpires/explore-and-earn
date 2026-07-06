import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BenefitProvision,
  ListingStatus,
  OpportunityCategory,
} from "@explore-and-earn/contracts";
import { hasVerifiedHostSubscription } from "@explore-and-earn/contracts";

import { adminClient } from "../adminClient";
import type { SeekerApplicationListing } from "./applications";

/**
 * Admin queries run through the SERVICE ROLE client so the numbers and rows
 * reflect EVERY record, bypassing RLS (an anon/authed client would only ever
 * see its own scoped rows). Every function here takes the service-role token
 * explicitly so the secret stays an obvious, auditable input.
 *
 * Reads go through an UNTYPED client handle (same `as unknown as SupabaseClient`
 * bridge used across queries/*.ts) because the committed types.gen.ts predates
 * several columns (clerk_user_id, etc.).
 */

function firstOf(value: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === "object"
    ? (candidate as Record<string, unknown>)
    : null;
}

/** Marketplace-wide counts for the founder admin dashboard. */
export interface MarketplaceStats {
  readonly totalListings: number;
  readonly liveListings: number;
  readonly draftListings: number;
  readonly underReviewListings: number;
  readonly totalApplications: number;
  readonly pendingApplications: number;
  readonly acceptedApplications: number;
  readonly totalHosts: number;
  readonly verifiedHosts: number;
  readonly totalSeekers: number;
}

/**
 * Count rows in `table`, optionally narrowed by equality `filters`. Uses a
 * head-only exact count so no row payload crosses the wire — just the number.
 */
async function countRows(
  db: SupabaseClient,
  table: string,
  filters: Record<string, string> = {},
): Promise<number> {
  let query = db.from(table).select("*", { count: "exact", head: true });
  for (const [column, value] of Object.entries(filters)) {
    query = query.eq(column, value);
  }
  const { count, error } = await query;
  if (error) {
    throw new Error(`getMarketplaceStats(${table}): ${error.message}`);
  }
  return count ?? 0;
}

/** Count host_profiles rows on an active paid subscription (any tier). */
async function countVerifiedHosts(db: SupabaseClient): Promise<number> {
  const { count, error } = await db
    .from("host_profiles")
    .select("*", { count: "exact", head: true })
    .in("subscription_tier", ["starter", "professional", "enterprise"]);
  if (error) {
    throw new Error(`getMarketplaceStats(host_profiles verified): ${error.message}`);
  }
  return count ?? 0;
}

/**
 * Live marketplace counts for the admin dashboard.
 *
 * Status vocabularies:
 *   - pendingApplications  = applications with status 'applied' (awaiting first review)
 *   - acceptedApplications = applications with status 'accepted'
 *   - verifiedHosts        = host_profiles on an active paid subscription (any tier) —
 *                            the same gate that renders the seeker-facing Verified Host badge
 *   - totalSeekers         = count of seeker_profiles rows
 */
export async function getMarketplaceStats(
  serviceRoleToken: string,
): Promise<MarketplaceStats> {
  const db = adminClient(serviceRoleToken) as unknown as SupabaseClient;

  const [
    totalListings,
    liveListings,
    draftListings,
    underReviewListings,
    totalApplications,
    pendingApplications,
    acceptedApplications,
    totalHosts,
    verifiedHosts,
    totalSeekers,
  ] = await Promise.all([
    countRows(db, "listings"),
    countRows(db, "listings", { status: "live" }),
    countRows(db, "listings", { status: "draft" }),
    countRows(db, "listings", { status: "under_review" }),
    countRows(db, "applications"),
    countRows(db, "applications", { status: "applied" }),
    countRows(db, "applications", { status: "accepted" }),
    countRows(db, "host_profiles"),
    countVerifiedHosts(db),
    countRows(db, "seeker_profiles"),
  ]);

  return {
    totalListings,
    liveListings,
    draftListings,
    underReviewListings,
    totalApplications,
    pendingApplications,
    acceptedApplications,
    totalHosts,
    verifiedHosts,
    totalSeekers,
  };
}

/** One listing row for the moderation table. */
export interface AdminListingRow {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly status: string;
  readonly publishedAt: string | null;
  readonly hostCompanyName: string;
}

/**
 * Every listing across all statuses (draft / under_review / live / paused /
 * closed / archived), newest first, with the owning host's company name.
 */
export async function getAllListingsForModeration(
  serviceRoleToken: string,
): Promise<AdminListingRow[]> {
  const db = adminClient(serviceRoleToken) as unknown as SupabaseClient;

  const { data, error } = await db
    .from("listings")
    .select(
      "id,title,category,status,published_at,host_profiles!host_profile_id(company_name)",
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`getAllListingsForModeration: ${error.message}`);
  }

  return (data ?? []).map((raw) => {
    const r = raw as Record<string, unknown>;
    const host = firstOf(r.host_profiles);
    return {
      id: String(r.id),
      title: typeof r.title === "string" ? r.title : "",
      category: typeof r.category === "string" ? r.category : "",
      status: typeof r.status === "string" ? r.status : "",
      publishedAt:
        typeof r.published_at === "string" ? r.published_at : null,
      hostCompanyName:
        host && typeof host.company_name === "string"
          ? host.company_name
          : "Unknown host",
    } satisfies AdminListingRow;
  });
}

/** One host row for the verification table. */
export interface AdminHostRow {
  readonly id: string;
  readonly companyName: string;
  readonly clerkUserId: string;
  /** Internal moderator trust flag — independent of the paid-subscription Verified Host badge. */
  readonly attestationStatus: string;
  readonly subscriptionTier: string | null;
  /** Set automatically after >3 non-dismissed spam reports in a rolling 30 days. */
  readonly flaggedForReview: boolean;
  readonly flaggedReason: string | null;
  readonly flaggedAt: string | null;
  readonly listingCount: number;
}

/**
 * Every host_profiles row, newest first, with a per-host listing count. The
 * count is tallied in JS from a single listings scan (the admin set is small
 * enough that one pass beats N per-host count queries).
 */
export async function getAllHostProfiles(
  serviceRoleToken: string,
): Promise<AdminHostRow[]> {
  const db = adminClient(serviceRoleToken) as unknown as SupabaseClient;

  const { data: hostRows, error: hostError } = await db
    .from("host_profiles")
    .select(
      "id,company_name,clerk_user_id,attestation_status,subscription_tier,flagged_for_review,flagged_reason,flagged_at",
    )
    .order("created_at", { ascending: false });
  if (hostError) {
    throw new Error(`getAllHostProfiles: ${hostError.message}`);
  }

  const { data: listingRows, error: listingError } = await db
    .from("listings")
    .select("host_profile_id");
  if (listingError) {
    throw new Error(`getAllHostProfiles(listings): ${listingError.message}`);
  }

  const listingCountByHost = new Map<string, number>();
  for (const raw of listingRows ?? []) {
    const hostProfileId = String(
      (raw as Record<string, unknown>).host_profile_id,
    );
    listingCountByHost.set(
      hostProfileId,
      (listingCountByHost.get(hostProfileId) ?? 0) + 1,
    );
  }

  return (hostRows ?? []).map((raw) => {
    const r = raw as Record<string, unknown>;
    const id = String(r.id);
    return {
      id,
      companyName:
        typeof r.company_name === "string" ? r.company_name : "",
      clerkUserId:
        typeof r.clerk_user_id === "string" ? r.clerk_user_id : "",
      attestationStatus:
        typeof r.attestation_status === "string"
          ? r.attestation_status
          : "",
      subscriptionTier:
        typeof r.subscription_tier === "string" ? r.subscription_tier : null,
      flaggedForReview: r.flagged_for_review === true,
      flaggedReason:
        typeof r.flagged_reason === "string" ? r.flagged_reason : null,
      flaggedAt: typeof r.flagged_at === "string" ? r.flagged_at : null,
      listingCount: listingCountByHost.get(id) ?? 0,
    } satisfies AdminHostRow;
  });
}

/**
 * Clear a host's spam-report flag (admin-only, service-role write). The flag
 * itself is set only by the trg_flag_host_on_spam_reports DB trigger (054);
 * this is the sole app-layer path that clears it, mirroring
 * adminSetHostAttestationStatus below.
 */
export async function clearHostFlag(
  serviceRoleToken: string,
  hostProfileId: string,
): Promise<{ ok: boolean; error?: string }> {
  const db = adminClient(serviceRoleToken) as unknown as SupabaseClient;

  const { error } = await db
    .from("host_profiles")
    .update({ flagged_for_review: false, flagged_reason: null, flagged_at: null })
    .eq("id", hostProfileId);
  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

/** One application row for the read-only pipeline table. */
export interface AdminApplicationRow {
  readonly id: string;
  readonly seekerClerkUserId: string;
  readonly listingTitle: string;
  readonly status: string;
  readonly createdAt: string;
}

/**
 * The most recent applications (default 50), newest first by created_at, joined
 * to the listing title and the applicant's Clerk user id. Read-only view.
 */
export async function getRecentApplications(
  serviceRoleToken: string,
  limit = 50,
): Promise<AdminApplicationRow[]> {
  const db = adminClient(serviceRoleToken) as unknown as SupabaseClient;

  const { data, error } = await db
    .from("applications")
    .select(
      "id,status,created_at,listings!listing_id(title),seeker_profiles!seeker_profile_id(clerk_user_id)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`getRecentApplications: ${error.message}`);
  }

  return (data ?? []).map((raw) => {
    const r = raw as Record<string, unknown>;
    const listing = firstOf(r.listings);
    const seeker = firstOf(r.seeker_profiles);
    return {
      id: String(r.id),
      seekerClerkUserId:
        seeker && typeof seeker.clerk_user_id === "string"
          ? seeker.clerk_user_id
          : "",
      listingTitle:
        listing && typeof listing.title === "string" ? listing.title : "",
      status: typeof r.status === "string" ? r.status : "",
      createdAt: typeof r.created_at === "string" ? r.created_at : "",
    } satisfies AdminApplicationRow;
  });
}

/**
 * Approve a listing: set status = 'live', and backfill published_at = now()
 * only when it has never been set (first approval). Two writes: an
 * unconditional status update, then a published_at update filtered to rows
 * where published_at IS NULL.
 */
export async function adminApproveListing(
  serviceRoleToken: string,
  listingId: string,
): Promise<{ ok: boolean; error?: string }> {
  const db = adminClient(serviceRoleToken) as unknown as SupabaseClient;

  const { error: statusError } = await db
    .from("listings")
    .update({ status: "live" })
    .eq("id", listingId);
  if (statusError) {
    return { ok: false, error: statusError.message };
  }

  const { error: publishedError } = await db
    .from("listings")
    .update({ published_at: new Date().toISOString() })
    .eq("id", listingId)
    .is("published_at", null);
  if (publishedError) {
    return { ok: false, error: publishedError.message };
  }

  return { ok: true };
}

/**
 * Reject a listing: set status = 'closed'. `reason` is accepted for API parity
 * with the server action but is not persisted — the listings table has no
 * rejection-reason column (006_listings.sql) and adding one would touch the
 * schema, which is out of scope for this change.
 */
export async function adminCloseListing(
  serviceRoleToken: string,
  listingId: string,
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  void reason;
  const db = adminClient(serviceRoleToken) as unknown as SupabaseClient;

  const { error } = await db
    .from("listings")
    .update({ status: "closed" })
    .eq("id", listingId);
  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

const ADMIN_LISTING_DETAIL_SELECT =
  "id, title, category, location_display, status, " +
  "housing_included, meals_included, compensation_summary, " +
  "compensation_min_cents, compensation_max_cents, compensation_unit, " +
  "compensation_currency, timeline_summary, cover_photo_url, " +
  "host_profiles!host_profile_id(company_name, subscription_tier)";

/**
 * Fetch a single listing by ID for the admin moderation detail view, bypassing
 * RLS via the service-role client. Returns null when the listing does not exist
 * or the query fails.
 */
export async function getAdminListingDetail(
  serviceRoleToken: string,
  listingId: string,
): Promise<SeekerApplicationListing | null> {
  const db = adminClient(serviceRoleToken) as unknown as SupabaseClient;

  const { data, error } = await db
    .from("listings")
    .select(ADMIN_LISTING_DETAIL_SELECT)
    .eq("id", listingId)
    .single();

  if (error || !data) return null;

  const row = data as unknown as Record<string, unknown>;
  const hostRaw = firstOf(row.host_profiles);
  const hostName =
    hostRaw &&
    typeof hostRaw.company_name === "string" &&
    hostRaw.company_name.length > 0
      ? hostRaw.company_name
      : "Unknown Host";
  const verified = hostRaw ? hasVerifiedHostSubscription(hostRaw.subscription_tier) : false;

  const housingProvision: BenefitProvision =
    row.housing_included === true ? "provided" : "not_provided";
  const mealsProvision: BenefitProvision =
    row.meals_included === true ? "provided" : "not_provided";

  let paySummary: string;
  if (
    typeof row.compensation_summary === "string" &&
    row.compensation_summary.length > 0
  ) {
    paySummary = row.compensation_summary;
  } else if (typeof row.compensation_min_cents === "number") {
    const fmt = (cents: number) =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(cents / 100);
    const min = fmt(row.compensation_min_cents);
    const maxCents =
      typeof row.compensation_max_cents === "number"
        ? row.compensation_max_cents
        : null;
    const range = maxCents != null ? `${min}–${fmt(maxCents)}` : `From ${min}`;
    const unit =
      typeof row.compensation_unit === "string" ? row.compensation_unit : null;
    paySummary = unit ? `${range}/${unit}` : range;
  } else {
    paySummary = "Unpaid / exchange";
  }

  const opportunityWindow =
    typeof row.timeline_summary === "string" &&
    row.timeline_summary.length > 0
      ? row.timeline_summary
      : "Open";

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
    opportunityWindow,
    status: (typeof row.status === "string"
      ? row.status
      : "live") as ListingStatus,
    host: { name: hostName, verified },
    benefits: {
      housing: { provision: housingProvision },
      meals: { provision: mealsProvision },
      pay: { provision: "provided", summary: paySummary },
    },
    coverImageUrl:
      typeof row.cover_photo_url === "string" ? row.cover_photo_url : null,
    beginsAt: typeof row.begins_at === "string" ? row.begins_at : null,
    endsAt: typeof row.ends_at === "string" ? row.ends_at : null,
  };
}

/**
 * Set a host's attestation_status to 'attested' or 'not_attested'.
 *
 * Canonical vocabulary (migration 003 CHECK constraint):
 *   not_attested | attested | attested_stale | withdrawn
 * 'attested' = admin has verified the host; 'not_attested' = reverting to
 * the default unverified state. 'attested_stale' and 'withdrawn' are set by
 * the trust lifecycle trigger, not by admin action.
 */
export async function adminSetHostAttestationStatus(
  serviceRoleToken: string,
  hostProfileId: string,
  attestationStatus: "attested" | "not_attested",
): Promise<{ ok: boolean; error?: string }> {
  const db = adminClient(serviceRoleToken) as unknown as SupabaseClient;

  const { error } = await db
    .from("host_profiles")
    .update({ attestation_status: attestationStatus })
    .eq("id", hostProfileId);
  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
