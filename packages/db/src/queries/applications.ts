import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BenefitProvision,
  BenefitTriad,
  ListingStatus,
  OpportunityCategory,
} from "@explore-and-earn/contracts";

import { authedClient } from "../client";

export interface ApplyResult {
  readonly ok: boolean;
  readonly error?: string;
}

/** Postgres unique_violation SQLSTATE -- surfaced as the already-applied case. */
const UNIQUE_VIOLATION = "23505";

/**
 * Resolve seeker_profiles.id for the authed Clerk user.
 *
 * `clerkUserId` must come from `auth().userId` -- never decode it from the token.
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
 * Apply the authed seeker to a listing.
 *
 * App-level ownership guard only (RLS is gated to a separate change). Expected
 * business outcomes are returned as a typed result rather than thrown:
 * - `unauthenticated`  — token had no decodable subject
 * - `profile_not_found` — no seeker_profiles row yet (Clerk webhook pending)
 * - `already_applied`   — unique (listing_id, seeker_profile_id) violation
 * - `cannot_apply_to_own_listing` — host cannot apply to their own listing
 */
export async function applyToListing(
  clerkToken: string,
  clerkUserId: string,
  listingId: string,
  coverMessage?: string,
): Promise<ApplyResult> {
  const seekerProfileId = await resolveSeekerProfileId(clerkToken, clerkUserId);
  if (!seekerProfileId) {
    return { ok: false, error: "profile_not_found" };
  }

  // Prevent self-application: host cannot apply to their own listing
  const authed = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data: listingOwner } = await authed
    .from("listings")
    .select("host_profiles!host_profile_id(clerk_user_id)")
    .eq("id", listingId)
    .maybeSingle();

  const hostClerkId = (listingOwner as unknown as { host_profiles?: { clerk_user_id?: string } } | null)?.host_profiles?.clerk_user_id;
  if (hostClerkId && hostClerkId === clerkUserId) {
    return { ok: false, error: "cannot_apply_to_own_listing" as const };
  }

  const { error } = await authedClient(clerkToken)
    .from("applications")
    .insert({
      listing_id: listingId,
      seeker_profile_id: seekerProfileId,
      cover_message: coverMessage ?? null,
    });

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: false, error: "already_applied" };
    }
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function getSeekerApplicationIds(
  clerkToken: string,
  clerkUserId: string,
): Promise<string[]> {
  const seekerProfileId = await resolveSeekerProfileId(clerkToken, clerkUserId);
  if (!seekerProfileId) {
    return [];
  }

  const { data, error } = await authedClient(clerkToken)
    .from("applications")
    .select("listing_id")
    .eq("seeker_profile_id", seekerProfileId)
    .neq("status", "withdrawn");

  if (error) {
    throw new Error(`getSeekerApplicationIds: ${error.message}`);
  }

  return (data ?? []).map((row) => row.listing_id);
}

export interface SeekerApplication {
  readonly id: string;
  readonly listingId: string;
  readonly status: string;
  readonly submittedAt: string;
  readonly expiresAt: string | null;
}

export async function getSeekerApplications(
  clerkToken: string,
  clerkUserId: string,
): Promise<SeekerApplication[]> {
  const seekerProfileId = await resolveSeekerProfileId(clerkToken, clerkUserId);
  if (!seekerProfileId) {
    return [];
  }

  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data, error } = await untyped
    .from("applications")
    .select("id, listing_id, status, submitted_at, expires_at")
    .eq("seeker_profile_id", seekerProfileId)
    .order("submitted_at", { ascending: false });

  if (error) {
    throw new Error(`getSeekerApplications: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    listingId: row.listing_id as string,
    status: row.status as string,
    submittedAt: typeof row.submitted_at === "string" ? row.submitted_at : "",
    expiresAt: typeof row.expires_at === "string" ? row.expires_at : null,
  }));
}

export interface HostApplication {
  readonly id: string;
  readonly listingId: string;
  readonly listingTitle: string;
  readonly seekerProfileId: string;
  readonly seekerClerkUserId: string;
  readonly status: string;
  readonly coverMessage: string | null;
  readonly submittedAt: string;
}

const HOST_APPLICATIONS_SELECT =
  "id,listing_id,seeker_profile_id,status,cover_message,submitted_at,listings!listing_id!inner(title,host_profile_id,host_profiles!host_profile_id!inner(clerk_user_id)),seeker_profiles!seeker_profile_id(clerk_user_id)";

function firstOf(value: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === "object"
    ? (candidate as Record<string, unknown>)
    : null;
}

export async function getHostApplications(
  clerkToken: string,
  clerkUserId: string,
): Promise<HostApplication[]> {
  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;

  try {
    const { data, error } = await untyped
      .from("applications")
      .select(HOST_APPLICATIONS_SELECT)
      .eq("listings.host_profiles.clerk_user_id", clerkUserId)
      .order("submitted_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      const listing = firstOf(r.listings);
      const seeker = firstOf(r.seeker_profiles);
      return {
        id: String(r.id),
        listingId: String(r.listing_id),
        listingTitle:
          listing && typeof listing.title === "string" ? listing.title : "",
        seekerProfileId: String(r.seeker_profile_id),
        seekerClerkUserId:
          seeker && typeof seeker.clerk_user_id === "string"
            ? seeker.clerk_user_id
            : "",
        status: typeof r.status === "string" ? r.status : "applied",
        coverMessage:
          typeof r.cover_message === "string" ? r.cover_message : null,
        submittedAt: String(r.submitted_at),
      } satisfies HostApplication;
    });
  } catch {
    return getHostApplicationsFallback(untyped, clerkUserId);
  }
}

async function getHostApplicationsFallback(
  untyped: SupabaseClient,
  clerkUserId: string,
): Promise<HostApplication[]> {
  const { data: hostRows, error: hostError } = await untyped
    .from("host_profiles")
    .select("id")
    .eq("clerk_user_id", clerkUserId);
  if (hostError) {
    throw new Error(`getHostApplications(host_profiles): ${hostError.message}`);
  }
  const hostProfileIds = (hostRows ?? []).map((r) =>
    String((r as Record<string, unknown>).id),
  );
  if (hostProfileIds.length === 0) {
    return [];
  }

  const { data: listingRows, error: listingError } = await untyped
    .from("listings")
    .select("id,title")
    .in("host_profile_id", hostProfileIds);
  if (listingError) {
    throw new Error(`getHostApplications(listings): ${listingError.message}`);
  }
  const listingTitleById = new Map<string, string>();
  for (const raw of listingRows ?? []) {
    const r = raw as Record<string, unknown>;
    listingTitleById.set(
      String(r.id),
      typeof r.title === "string" ? r.title : "",
    );
  }
  const listingIds = [...listingTitleById.keys()];
  if (listingIds.length === 0) {
    return [];
  }

  const { data: appRows, error: appError } = await untyped
    .from("applications")
    .select("id,listing_id,seeker_profile_id,status,cover_message,submitted_at")
    .in("listing_id", listingIds)
    .order("submitted_at", { ascending: false });
  if (appError) {
    throw new Error(`getHostApplications(applications): ${appError.message}`);
  }
  const apps = (appRows ?? []).map((raw) => raw as Record<string, unknown>);

  const seekerProfileIds = [
    ...new Set(apps.map((r) => String(r.seeker_profile_id))),
  ];
  const seekerClerkById = new Map<string, string>();
  if (seekerProfileIds.length > 0) {
    const { data: seekerRows, error: seekerError } = await untyped
      .from("seeker_profiles")
      .select("id,clerk_user_id")
      .in("id", seekerProfileIds);
    if (seekerError) {
      throw new Error(
        `getHostApplications(seeker_profiles): ${seekerError.message}`,
      );
    }
    for (const raw of seekerRows ?? []) {
      const r = raw as Record<string, unknown>;
      seekerClerkById.set(
        String(r.id),
        typeof r.clerk_user_id === "string" ? r.clerk_user_id : "",
      );
    }
  }

  return apps.map((r) => ({
    id: String(r.id),
    listingId: String(r.listing_id),
    listingTitle: listingTitleById.get(String(r.listing_id)) ?? "",
    seekerProfileId: String(r.seeker_profile_id),
    seekerClerkUserId: seekerClerkById.get(String(r.seeker_profile_id)) ?? "",
    status: typeof r.status === "string" ? r.status : "applied",
    coverMessage: typeof r.cover_message === "string" ? r.cover_message : null,
    submittedAt: String(r.submitted_at),
  } satisfies HostApplication));
}

export async function getApplicationCountsByListing(
  clerkToken: string,
  clerkUserId: string,
): Promise<Record<string, number>> {
  const applications = await getHostApplications(clerkToken, clerkUserId);
  const counts: Record<string, number> = {};
  for (const application of applications) {
    counts[application.listingId] = (counts[application.listingId] ?? 0) + 1;
  }
  return counts;
}

const HOST_SETTABLE_STATUSES = [
  "reviewing",
  "saved_by_host",
  "offered",
  "not_selected",
] as const;

export type HostSettableStatus = (typeof HOST_SETTABLE_STATUSES)[number];

export async function updateApplicationStatus(
  clerkToken: string,
  clerkUserId: string,
  applicationId: string,
  newStatus: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!(HOST_SETTABLE_STATUSES as readonly string[]).includes(newStatus)) {
    return { ok: false, error: "invalid_status" };
  }

  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;

  const { data: hostRows, error: hostError } = await untyped
    .from("host_profiles")
    .select("id")
    .eq("clerk_user_id", clerkUserId);
  if (hostError) {
    return { ok: false, error: hostError.message };
  }
  const hostProfileIds = new Set(
    (hostRows ?? []).map((r) => String((r as Record<string, unknown>).id)),
  );
  if (hostProfileIds.size === 0) {
    return { ok: false, error: "profile_not_found" };
  }

  const { data: appRow, error: appError } = await untyped
    .from("applications")
    .select("id,listing_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (appError) {
    return { ok: false, error: appError.message };
  }
  if (!appRow) {
    return { ok: false, error: "not_found" };
  }

  const listingId = String((appRow as Record<string, unknown>).listing_id);
  const { data: listingRow, error: listingError } = await untyped
    .from("listings")
    .select("id,host_profile_id")
    .eq("id", listingId)
    .maybeSingle();
  if (listingError) {
    return { ok: false, error: listingError.message };
  }
  if (
    !listingRow ||
    !hostProfileIds.has(
      String((listingRow as Record<string, unknown>).host_profile_id),
    )
  ) {
    return { ok: false, error: "forbidden" };
  }

  const { error: updateError } = await untyped
    .from("applications")
    .update({ status: newStatus })
    .eq("id", applicationId);
  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  return { ok: true };
}

export interface ApplicationListing {
  readonly id: string;
  readonly title: string;
  readonly category: OpportunityCategory;
  readonly location: string;
  readonly opportunityWindow: string;
  readonly status: ListingStatus;
  readonly host: { readonly name: string; readonly verified: boolean };
  readonly benefits: BenefitTriad;
}

export type ApplicationWithListing = SeekerApplication & {
  readonly listing: ApplicationListing | null;
};

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
    const fmt = (cents: number) =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
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

function rowToDiscoveryListing(value: unknown): ApplicationListing | null {
  const row = firstOf(value);
  if (!row) {
    return null;
  }

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
    opportunityWindow:
      typeof row.timeline_summary === "string" &&
      row.timeline_summary.length > 0
        ? row.timeline_summary
        : "Open",
    status: (typeof row.status === "string"
      ? row.status
      : "live") as ListingStatus,
    host: { name: "Unknown Host", verified: false },
    benefits,
  };
}

export async function getSeekerApplicationsWithListings(
  clerkToken: string,
  clerkUserId: string,
  statuses: string[],
): Promise<ApplicationWithListing[]> {
  if (statuses.length === 0) {
    return [];
  }

  const seekerProfileId = await resolveSeekerProfileId(clerkToken, clerkUserId);
  if (!seekerProfileId) {
    return [];
  }

  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data, error } = await untyped
    .from("applications")
    .select(
      "id, listing_id, status, submitted_at, expires_at, listings!listing_id(id, title, category, location_display, housing_included, meals_included, compensation_summary, compensation_min_cents, compensation_max_cents, compensation_unit, timeline_summary)",
    )
    .eq("seeker_profile_id", seekerProfileId)
    .in("status", statuses)
    .order("submitted_at", { ascending: false });

  if (error) {
    throw new Error(`getSeekerApplicationsWithListings: ${error.message}`);
  }

  return (data ?? []).map((raw) => {
    const r = raw as Record<string, unknown>;
    return {
      id: String(r.id),
      listingId: String(r.listing_id),
      status: typeof r.status === "string" ? r.status : "applied",
      submittedAt: typeof r.submitted_at === "string" ? r.submitted_at : "",
      expiresAt: typeof r.expires_at === "string" ? r.expires_at : null,
      listing: rowToDiscoveryListing(r.listings),
    } satisfies ApplicationWithListing;
  });
}

/* -------------------------------------------------------------------------- */
/* Seeker self-service: full application + listing + host (Wave 10 / Agent B). */
/* -------------------------------------------------------------------------- */

/**
 * Statuses the SEEKER may set from their own /applied dashboard.
 * Only accept/decline a live offer. Host-settable statuses live above.
 */
const SEEKER_SETTABLE_STATUSES = ["accepted", "not_selected"] as const;
export type SeekerSettableStatus = (typeof SEEKER_SETTABLE_STATUSES)[number];

/**
 * Richer listing view-model for /applied + offer detail, including the host
 * identity (company name + self-declared verification).
 */
export interface SeekerApplicationListing extends ApplicationListing {
  readonly coverImageUrl: string | null;
}

export type SeekerApplicationWithListing = SeekerApplication & {
  readonly coverMessage: string | null;
  readonly listing: SeekerApplicationListing | null;
};

const SEEKER_APPLICATION_SELECT =
  "id, listing_id, status, cover_message, submitted_at, expires_at, " +
  "listings!listing_id(id, title, category, location_display, status, " +
  "housing_included, meals_included, compensation_summary, " +
  "compensation_min_cents, compensation_max_cents, compensation_unit, " +
  "compensation_currency, timeline_summary, cover_photo_url, " +
  "host_profiles(company_name, attestation_status))";

function isVerifiedAttestation(value: unknown): boolean {
  return value === "attested";
}

function rowToSeekerApplicationListing(
  value: unknown,
): SeekerApplicationListing | null {
  const row = firstOf(value);
  if (!row) return null;

  const hostRaw = firstOf(row.host_profiles);
  const hostName =
    hostRaw &&
    typeof hostRaw.company_name === "string" &&
    hostRaw.company_name.length > 0
      ? hostRaw.company_name
      : "Unknown Host";
  const verified = hostRaw ? isVerifiedAttestation(hostRaw.attestation_status) : false;

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
    opportunityWindow:
      typeof row.timeline_summary === "string" &&
      row.timeline_summary.length > 0
        ? row.timeline_summary
        : "Open",
    status: (typeof row.status === "string"
      ? row.status
      : "live") as ListingStatus,
    host: { name: hostName, verified },
    benefits,
    coverImageUrl:
      typeof row.cover_photo_url === "string" ? row.cover_photo_url : null,
  };
}

/**
 * All applications for the authed seeker, newest first, joined to listing + host.
 */
export async function getApplicationsForSeekerWithListings(
  clerkToken: string,
  clerkUserId: string,
): Promise<SeekerApplicationWithListing[]> {
  const seekerProfileId = await resolveSeekerProfileId(clerkToken, clerkUserId);
  if (!seekerProfileId) return [];

  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data, error } = await untyped
    .from("applications")
    .select(SEEKER_APPLICATION_SELECT)
    .eq("seeker_profile_id", seekerProfileId)
    .order("submitted_at", { ascending: false });

  if (error) {
    throw new Error(`getApplicationsForSeekerWithListings: ${error.message}`);
  }

  return (data ?? []).map((raw) => {
    const r = raw as unknown as Record<string, unknown>;
    return {
      id: String(r.id),
      listingId: String(r.listing_id),
      status: typeof r.status === "string" ? r.status : "applied",
      submittedAt: typeof r.submitted_at === "string" ? r.submitted_at : "",
      expiresAt: typeof r.expires_at === "string" ? r.expires_at : null,
      coverMessage:
        typeof r.cover_message === "string" ? r.cover_message : null,
      listing: rowToSeekerApplicationListing(r.listings),
    } satisfies SeekerApplicationWithListing;
  });
}

/**
 * Single application by id, scoped to the authed seeker's ownership.
 */
export async function getApplicationById(
  clerkToken: string,
  clerkUserId: string,
  applicationId: string,
): Promise<SeekerApplicationWithListing | null> {
  const seekerProfileId = await resolveSeekerProfileId(clerkToken, clerkUserId);
  if (!seekerProfileId) return null;

  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data, error } = await untyped
    .from("applications")
    .select(SEEKER_APPLICATION_SELECT)
    .eq("id", applicationId)
    .eq("seeker_profile_id", seekerProfileId)
    .maybeSingle();

  if (error) {
    throw new Error(`getApplicationById: ${error.message}`);
  }
  if (!data) return null;

  const r = data as unknown as Record<string, unknown>;
  return {
    id: String(r.id),
    listingId: String(r.listing_id),
    status: typeof r.status === "string" ? r.status : "applied",
    submittedAt: typeof r.submitted_at === "string" ? r.submitted_at : "",
    expiresAt: typeof r.expires_at === "string" ? r.expires_at : null,
    coverMessage:
      typeof r.cover_message === "string" ? r.cover_message : null,
    listing: rowToSeekerApplicationListing(r.listings),
  } satisfies SeekerApplicationWithListing;
}

/**
 * Seeker-facing status update: accept or decline a live offer.
 *
 * Validates:
 *  1. newStatus is in SEEKER_SETTABLE_STATUSES
 *  2. Caller owns the application (seeker_profile_id matches)
 *  3. Current application status is 'offered' (can only act on a live offer)
 */
export async function updateApplicationStatusBySeeker(
  clerkToken: string,
  clerkUserId: string,
  applicationId: string,
  newStatus: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!(SEEKER_SETTABLE_STATUSES as readonly string[]).includes(newStatus)) {
    return { ok: false, error: "invalid_status" };
  }

  const seekerProfileId = await resolveSeekerProfileId(clerkToken, clerkUserId);
  if (!seekerProfileId) {
    return { ok: false, error: "profile_not_found" };
  }

  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data: appRow, error: appError } = await untyped
    .from("applications")
    .select("id, seeker_profile_id, status")
    .eq("id", applicationId)
    .maybeSingle();

  if (appError) return { ok: false, error: appError.message };
  if (!appRow) return { ok: false, error: "not_found" };

  const row = appRow as Record<string, unknown>;

  if (String(row.seeker_profile_id) !== seekerProfileId) {
    return { ok: false, error: "forbidden" };
  }
  if (String(row.status) !== "offered") {
    return { ok: false, error: "invalid_transition" };
  }

  const { error: updateError } = await untyped
    .from("applications")
    .update({ status: newStatus })
    .eq("id", applicationId)
    .eq("seeker_profile_id", seekerProfileId);

  if (updateError) return { ok: false, error: updateError.message };
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Host pipeline: application detail + alias (Wave 10 / Agent C).             */
/* -------------------------------------------------------------------------- */

/**
 * All applications across the authed host's listings, newest first.
 * Delegates to getHostApplications — provided as a named alias so callers
 * explicitly referencing the host-pipeline brief can import by that name.
 */
export async function getAllApplicationsForHost(
  clerkToken: string,
  clerkUserId: string,
): Promise<HostApplication[]> {
  return getHostApplications(clerkToken, clerkUserId);
}

/**
 * A single application enriched with the seeker's display name and bio, for
 * the applicant-detail surface. Ownership is re-checked via getHostApplications
 * (which scopes to the caller's listings) before reading the seeker row.
 *
 * Returns null when the application is not found or the caller does not own the
 * listing the application targets.
 */
export interface ApplicationWithSeekerDetail extends HostApplication {
  readonly seekerDisplayName: string | null;
  readonly seekerBio: string | null;
}

export async function getApplicationWithSeekerDetail(
  clerkToken: string,
  clerkUserId: string,
  applicationId: string,
): Promise<ApplicationWithSeekerDetail | null> {
  const applications = await getHostApplications(clerkToken, clerkUserId);
  const application = applications.find((app) => app.id === applicationId);
  if (!application) {
    return null;
  }

  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;

  // Best-effort seeker profile read: display_name may not exist as a column
  // yet (forward-compatible missing-column fallback).
  let seekerDisplayName: string | null = null;
  let seekerBio: string | null = null;

  try {
    const { data, error } = await untyped
      .from("seeker_profiles")
      .select("display_name, short_bio")
      .eq("id", application.seekerProfileId)
      .maybeSingle();
    if (!error && data) {
      const row = data as Record<string, unknown>;
      seekerDisplayName =
        typeof row.display_name === "string" && row.display_name.trim().length > 0
          ? row.display_name.trim()
          : null;
      seekerBio =
        typeof row.short_bio === "string" && row.short_bio.trim().length > 0
          ? row.short_bio.trim()
          : null;
    }
  } catch {
    // Missing-column fallback: any error means no extra data to show.
  }

  return { ...application, seekerDisplayName, seekerBio };
}
