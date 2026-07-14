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

import { authedClient } from "../client";
import type { SeekerApplicationListing } from "./applications";

/*
 * Seeker self-service dashboard data (Agent 2 / PR 2).
 *
 * This module is intentionally separate from the large queries/applications.ts
 * so we add NEW capabilities without editing or risking the existing seeker /
 * host query surface. It re-derives a couple of small private helpers (profile
 * resolution, row -> listing view-model) rather than exporting internals from
 * applications.ts, keeping that file's public signatures untouched.
 */

/** Resolve seeker_profiles.id for the authed Clerk user. */
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

function firstOf(value: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === "object"
    ? (candidate as Record<string, unknown>)
    : null;
}

// Compensation summary via the shared, locale-ready formatter (default currency
// applied in the formatter) — no inline currency/date formatting in the DB
// layer. See @explore-and-earn/contracts format.ts.
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
  });
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
  const verified = hostRaw
    ? hasVerifiedHostSubscription(hostRaw.subscription_tier)
    : false;

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
    opportunityWindow: formatOpportunityWindow({
      timelineSummary:
        typeof row.timeline_summary === "string" ? row.timeline_summary : null,
    }),
    status: (typeof row.status === "string"
      ? row.status
      : "live") as ListingStatus,
    host: { name: hostName, verified },
    benefits,
    coverImageUrl:
      typeof row.cover_photo_url === "string" ? row.cover_photo_url : null,
    beginsAt: typeof row.begins_at === "string" ? row.begins_at : null,
    endsAt: typeof row.ends_at === "string" ? row.ends_at : null,
  };
}

/**
 * One application, joined to its listing + host, plus the lifecycle timestamps
 * the /applied detail timeline needs. Superset of SeekerApplicationWithListing
 * without coupling to that type's definition.
 */
export interface RichSeekerApplication {
  readonly id: string;
  readonly listingId: string;
  readonly status: string;
  readonly submittedAt: string;
  readonly reviewedAt: string | null;
  readonly decidedAt: string | null;
  readonly coverMessage: string | null;
  readonly listing: SeekerApplicationListing | null;
}

const RICH_SEEKER_APPLICATION_SELECT =
  "id, listing_id, status, cover_message, submitted_at, reviewed_at, " +
  "decided_at, listings!listing_id(id, title, category, location_display, " +
  "status, housing_included, meals_included, compensation_summary, " +
  "compensation_min_cents, compensation_max_cents, compensation_unit, " +
  "compensation_currency, timeline_summary, cover_photo_url, " +
  "host_profiles(company_name, subscription_tier))";

/**
 * All applications for the authed seeker, newest first, joined to listing +
 * host, including reviewed_at / decided_at for the status timeline.
 */
export async function getSeekerApplicationsRich(
  clerkToken: string,
  clerkUserId: string,
): Promise<RichSeekerApplication[]> {
  const seekerProfileId = await resolveSeekerProfileId(clerkToken, clerkUserId);
  if (!seekerProfileId) return [];

  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data, error } = await untyped
    .from("applications")
    .select(RICH_SEEKER_APPLICATION_SELECT)
    .eq("seeker_profile_id", seekerProfileId)
    .order("submitted_at", { ascending: false });

  if (error) {
    throw new Error(`getSeekerApplicationsRich: ${error.message}`);
  }

  return (data ?? []).map((raw) => {
    const r = raw as unknown as Record<string, unknown>;
    return {
      id: String(r.id),
      listingId: String(r.listing_id),
      status: typeof r.status === "string" ? r.status : "applied",
      submittedAt: typeof r.submitted_at === "string" ? r.submitted_at : "",
      reviewedAt: typeof r.reviewed_at === "string" ? r.reviewed_at : null,
      decidedAt: typeof r.decided_at === "string" ? r.decided_at : null,
      coverMessage:
        typeof r.cover_message === "string" ? r.cover_message : null,
      listing: rowToSeekerApplicationListing(r.listings),
    } satisfies RichSeekerApplication;
  });
}

/**
 * Single rich application lookup for the authed seeker.
 *
 * Ownership is enforced via seeker_profile_id equality — callers receive null
 * for any id that does not belong to them (including non-existent ids), so no
 * separate 403/404 distinction is needed at the page level.
 */
export async function getSeekerApplicationRichById(
  clerkToken: string,
  clerkUserId: string,
  applicationId: string,
): Promise<RichSeekerApplication | null> {
  const seekerProfileId = await resolveSeekerProfileId(clerkToken, clerkUserId);
  if (!seekerProfileId) return null;

  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data, error } = await untyped
    .from("applications")
    .select(RICH_SEEKER_APPLICATION_SELECT)
    .eq("id", applicationId)
    .eq("seeker_profile_id", seekerProfileId)
    .maybeSingle();

  if (error) {
    throw new Error(`getSeekerApplicationRichById: ${error.message}`);
  }
  if (!data) return null;

  const r = data as unknown as Record<string, unknown>;
  return {
    id: String(r.id),
    listingId: String(r.listing_id),
    status: typeof r.status === "string" ? r.status : "applied",
    submittedAt: typeof r.submitted_at === "string" ? r.submitted_at : "",
    reviewedAt: typeof r.reviewed_at === "string" ? r.reviewed_at : null,
    decidedAt: typeof r.decided_at === "string" ? r.decided_at : null,
    coverMessage:
      typeof r.cover_message === "string" ? r.cover_message : null,
    listing: rowToSeekerApplicationListing(r.listings),
  } satisfies RichSeekerApplication;
}

export interface WithdrawApplicationResult {
  readonly ok: boolean;
  readonly error?: string;
}

/**
 * Statuses a seeker may withdraw from. Mirrors APPLICATION_TRANSITIONS
 * (packages/contracts/src/lifecycles.ts): applied/reviewing/saved_by_host ->
 * withdrawn are all permitted lifecycle edges. `offered` is deliberately
 * excluded — a seeker already has a distinct accept/decline path for an offer
 * (SEEKER_SETTABLE_STATUSES in applications.ts); withdrawing from an active
 * offer would be a second, conflicting way to say the same thing.
 */
const WITHDRAWABLE_STATUSES = new Set(["applied", "reviewing", "saved_by_host"]);

/**
 * Withdraw the authed seeker's own application.
 *
 * App-level guards (RLS is gated to a separate change):
 * - profile_not_found — no seeker_profiles row
 * - not_found         — application id does not exist (or not visible)
 * - forbidden         — application belongs to a different seeker
 * - invalid_status    — only applied/reviewing/saved_by_host may be withdrawn
 *
 * Every one of those source statuses -> withdrawn is a permitted lifecycle
 * transition, so the DB-side lifecycle trigger accepts the update.
 */
export async function withdrawApplication(
  clerkToken: string,
  clerkUserId: string,
  applicationId: string,
): Promise<WithdrawApplicationResult> {
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
  if (appError) {
    return { ok: false, error: appError.message };
  }
  if (!appRow) {
    return { ok: false, error: "not_found" };
  }

  const row = appRow as Record<string, unknown>;
  if (String(row.seeker_profile_id) !== seekerProfileId) {
    return { ok: false, error: "forbidden" };
  }
  if (typeof row.status !== "string" || !WITHDRAWABLE_STATUSES.has(row.status)) {
    return { ok: false, error: "invalid_status" };
  }

  const { error: updateError } = await untyped
    .from("applications")
    .update({ status: "withdrawn", withdrawn_reason: "seeker_withdrew" })
    .eq("id", applicationId)
    .eq("seeker_profile_id", seekerProfileId);
  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  return { ok: true };
}
