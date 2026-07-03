import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  BenefitProvision,
  CompensationUnit,
  ListingStatus,
  OpportunityCategory,
  OpportunityListing,
} from "@explore-and-earn/contracts";
import { MARKETPLACE_CATEGORIES } from "@explore-and-earn/contracts";
import { anonClient, authedClient } from "../client";
import { getSeekerApplicationIds } from "./applications";

export interface ListingRow {
  id: string;
  host_profile_id: string | null;
  title: string;
  category: OpportunityCategory;
  description: string | null;
  location_display: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  housing_included: boolean;
  meals_included: boolean;
  housing_description: string | null;
  meals_description: string | null;
  visa_support: boolean;
  compensation_summary: string | null;
  compensation_min_cents: number | null;
  compensation_max_cents: number | null;
  compensation_unit: string | null;
  compensation_currency: string;
  timeline_summary: string | null;
  begins_at: string | null;
  ends_at: string | null;
  published_at: string | null;
  cover_photo_url: string | null;
  gallery_photo_urls: string[] | null;
  host_profiles: {
    company_name: string;
    attestation_status: string;
  } | null;
}

type RawListingRow = {
  id: string;
  host_profile_id: string | null;
  title: string;
  category: string;
  description: string | null;
  location_display: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  housing_included: boolean;
  meals_included: boolean;
  housing_description: string | null;
  meals_description: string | null;
  visa_support: boolean;
  compensation_summary: string | null;
  compensation_min_cents: number | null;
  compensation_max_cents: number | null;
  compensation_unit: string | null;
  compensation_currency: string;
  timeline_summary: string | null;
  begins_at: string | null;
  ends_at: string | null;
  published_at: string | null;
  cover_photo_url: string | null;
  gallery_photo_urls: string[] | null;
  host_profiles: { company_name: string; attestation_status: string } | null;
};

function formatOpportunityWindow(
  row: Pick<ListingRow, "begins_at" | "ends_at" | "timeline_summary">,
): string {
  if (row.timeline_summary) return row.timeline_summary;
  if (row.begins_at && row.ends_at) {
    const fmt = (d: string) =>
      new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" });
    return `${fmt(row.begins_at)}\u2013${fmt(row.ends_at)}`;
  }
  return "Open";
}

function buildCompensationSummary(
  row: Pick<
    ListingRow,
    | "compensation_summary"
    | "compensation_min_cents"
    | "compensation_max_cents"
    | "compensation_unit"
    | "compensation_currency"
  >,
): string {
  if (row.compensation_summary) return row.compensation_summary;
  const unit = row.compensation_unit ?? "other";
  const currency = row.compensation_currency;
  if (row.compensation_min_cents != null) {
    const fmt = (cents: number) =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(cents / 100);
    const min = fmt(row.compensation_min_cents);
    const max = row.compensation_max_cents != null ? fmt(row.compensation_max_cents) : null;
    const range = max && max !== min ? `${min}\u2013${max}` : min;
    return unit === "other" || unit === "exchange" || unit === "stipend"
      ? range
      : `${range}/${unit}`;
  }
  return "Negotiable";
}

function toListingRow(raw: RawListingRow): ListingRow {
  return { ...raw, category: raw.category as OpportunityCategory };
}

/** Maps a ListingRow to the DiscoveryListing view-model fields. */
export function rowToDiscoveryFields(row: ListingRow): OpportunityListing {
  const hostName = row.host_profiles?.company_name ?? "Unknown Host";
  const verified = row.host_profiles?.attestation_status === "attested";

  const housingProvision: BenefitProvision = row.housing_included ? "provided" : "not_provided";
  const mealsProvision: BenefitProvision = row.meals_included ? "provided" : "not_provided";

  return {
    id: row.id,
    title: row.title,
    category: row.category,
    location: row.location_display ?? "Location not specified",
    opportunityWindow: formatOpportunityWindow(row),
    begins: row.begins_at ?? undefined,
    ends: row.ends_at ?? undefined,
    status: row.status as ListingStatus,
    host: {
      id: row.host_profile_id ?? undefined,
      name: hostName,
      verified,
    },
    benefits: {
      housing: {
        provision: housingProvision,
        summary: row.housing_description ?? undefined,
      },
      meals: {
        provision: mealsProvision,
        summary: row.meals_description ?? undefined,
      },
      pay: {
        provision: "provided" as BenefitProvision,
        summary: buildCompensationSummary(row),
      },
    },
    payInsight:
      row.compensation_min_cents != null || row.compensation_max_cents != null
        ? {
            minCents: row.compensation_min_cents ?? undefined,
            maxCents: row.compensation_max_cents ?? undefined,
            unit: (row.compensation_unit as CompensationUnit | null) ?? null,
            currency: row.compensation_currency,
          }
        : undefined,
    visaSupport: row.visa_support,
    coverImageUrl: row.cover_photo_url ?? undefined,
    coordinates:
      row.latitude != null && row.longitude != null
        ? { lat: row.latitude, lon: row.longitude }
        : undefined,
  };
}

const LISTING_COLUMNS =
  "id,host_profile_id,title,category,description,location_display,latitude,longitude,status,housing_included,meals_included,housing_description,meals_description,visa_support,compensation_summary,compensation_min_cents,compensation_max_cents,compensation_unit,compensation_currency,timeline_summary,begins_at,ends_at,published_at,cover_photo_url,gallery_photo_urls,host_profiles(company_name,attestation_status)";

/** Max cards returned per swipe-deck page (Task 1/Task 3 batch size). */
export const SWIPE_BATCH_SIZE = 20;

/**
 * Default candidate cap for the public live-listings feed. Discovery scores and
 * re-ranks in Node, then slices to ~20, so pulling the entire `listings` table
 * on every render is pure waste. 200 most-recently-published live listings is a
 * generous candidate pool for scoring at launch scale; callers that genuinely
 * need the full set (e.g. the sitemap) pass an explicit higher cap.
 */
export const PUBLIC_LISTINGS_FEED_CAP = 200;

/** Public live listings \u2014 no auth required. Bounded to `limit` most-recent. */
export async function getPublicListings(
  limit: number = PUBLIC_LISTINGS_FEED_CAP,
): Promise<ListingRow[]> {
  const { data, error } = await anonClient()
    .from("listings")
    .select(LISTING_COLUMNS)
    .eq("status", "live")
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`getPublicListings: ${error.message}`);
  return ((data ?? []) as unknown as RawListingRow[]).map(toListingRow);
}

/** Single live listing by id \u2014 no auth required. */
export async function getPublicListingById(id: string): Promise<ListingRow | null> {
  const { data, error } = await anonClient()
    .from("listings")
    .select(LISTING_COLUMNS)
    .eq("id", id)
    .eq("status", "live")
    .maybeSingle();

  if (error) throw new Error(`getPublicListingById: ${error.message}`);
  return data ? toListingRow(data as unknown as RawListingRow) : null;
}

/**
 * Batch variant of getPublicListingById: fetch many live listings in a single
 * query instead of one round-trip per id (eliminates the N+1 on the
 * saved/applied/messages surfaces). No auth required (public listings).
 */
export async function getPublicListingsByIds(ids: string[]): Promise<ListingRow[]> {
  if (ids.length === 0) return [];

  const { data, error } = await anonClient()
    .from("listings")
    .select(LISTING_COLUMNS)
    .in("id", ids)
    .eq("status", "live");

  if (error) throw new Error(`getPublicListingsByIds: ${error.message}`);
  return ((data ?? []) as unknown as RawListingRow[]).map(toListingRow);
}

/**
 * Swipe-deck batch for the authenticated seeker (/swipe surface).
 *
 * Returns up to SWIPE_BATCH_SIZE live listings, newest-first with a stable
 * (published_at DESC, id DESC) order so cursor pagination below is
 * deterministic. Excludes:
 *   - every id in `excludeIds` (cards already seen this session + the seeker's
 *     saved ids passed by the caller), and
 *   - every listing the seeker has already applied to (resolved server-side via
 *     getSeekerApplicationIds \u2014 never trust a client-supplied applied set).
 *
 * `clerkUserId` MUST come from auth().userId \u2014 never decoded from the token.
 * `cursor` is the published_at of the last row from the previous page; when
 * present we fetch strictly older rows via .lt("published_at", cursor).
 *
 * Best-effort on the applied filter: a seeker with no profile resolves to [] so
 * nothing is excluded on that axis.
 */
export async function getSwipeBatch(
  clerkToken: string,
  clerkUserId: string,
  excludeIds: string[],
  cursor?: string,
): Promise<ListingRow[]> {
  const appliedIds = await getSeekerApplicationIds(clerkToken, clerkUserId);
  const exclude = Array.from(new Set([...excludeIds, ...appliedIds]));

  let builder = authedClient(clerkToken)
    .from("listings")
    .select(LISTING_COLUMNS)
    .eq("status", "live");

  if (cursor) {
    builder = builder.lt("published_at", cursor);
  }
  if (exclude.length > 0) {
    // PostgREST not-in group: values are UUIDs (validated at the action layer),
    // so a bare `(id1,id2,...)` list is safe \u2014 no quoting/escaping needed.
    builder = builder.not("id", "in", `(${exclude.join(",")})`);
  }

  const { data, error } = await builder
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(SWIPE_BATCH_SIZE);

  if (error) throw new Error(`getSwipeBatch: ${error.message}`);
  return ((data ?? []) as unknown as RawListingRow[]).map(toListingRow);
}

/**
 * All live listings that carry geocoordinates, newest-first \u2014 backs the seeker
 * /map surface. latitude/longitude are the real columns (the brief's lat/lng);
 * rows missing either are filtered out so every result is mappable.
 *
 * Public data (same trust level as getPublicListings). Pass a Clerk token to go
 * through the authed client, or omit it to use the anon client (the map is a
 * public read).
 */
export async function getLiveListingsWithCoords(
  clerkToken?: string,
): Promise<ListingRow[]> {
  const db = clerkToken ? authedClient(clerkToken) : anonClient();
  const { data, error } = await db
    .from("listings")
    .select(LISTING_COLUMNS)
    .eq("status", "live")
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .order("published_at", { ascending: false });

  if (error) throw new Error(`getLiveListingsWithCoords: ${error.message}`);
  return ((data ?? []) as unknown as RawListingRow[]).map(toListingRow);
}

/**
 * Filters accepted by {@link searchListings}. Every field is optional; an empty
 * filter object returns the newest live listings (the same set as
 * getPublicListings, capped by `limit`).
 *
 * startDateAfter / startDateBefore filter on the listing `begins_at` column
 * (ISO date or timestamp strings). `offset` opts into range-based pagination;
 * when omitted the query falls back to a simple `.limit(limit)`.
 */
export interface SearchFilters {
  query?: string;
  categories?: string[];
  hasHousing?: boolean;
  hasMeals?: boolean;
  visaSupport?: boolean;
  startRangeMonths?: 1 | 3 | 6;
  payMin?: number;
  payUnit?: CompensationUnit;
  location?: string;
  startDateAfter?: string;
  startDateBefore?: string;
  limit?: number;
  offset?: number;
}

const DEFAULT_SEARCH_LIMIT = 48;

function sanitizeSearchTerm(term: string): string {
  return term.slice(0, 200).replace(/[,()*%]/g, " ").replace(/\s+/g, " ").trim();
}

export async function searchListings(filters: SearchFilters): Promise<ListingRow[]> {
  let builder = anonClient()
    .from("listings")
    .select(LISTING_COLUMNS)
    .eq("status", "live");

  const term = filters.query ? sanitizeSearchTerm(filters.query) : "";
  if (term) {
    // Full-text path: query the generated `search_vector` tsvector (migration
    // 022) via plainto_tsquery. The non-text paths below (location ilike,
    // category, benefits, pay, date range) still apply for empty/null queries.
    builder = builder.textSearch("search_vector", term, {
      type: "plain",
      config: "english",
    });
  }

  const categories = (filters.categories ?? []).filter((category) =>
    (MARKETPLACE_CATEGORIES as readonly string[]).includes(category),
  );
  if (categories.length > 0) {
    builder = builder.in("category", categories);
  }

  if (filters.hasHousing) builder = builder.eq("housing_included", true);
  if (filters.hasMeals) builder = builder.eq("meals_included", true);
  if (filters.visaSupport) builder = builder.eq("visa_support", true);

  if (filters.payMin != null && Number.isFinite(filters.payMin) && filters.payMin > 0) {
    builder = builder.gte("compensation_min_cents", Math.round(filters.payMin * 100));
  }

  if (filters.payUnit === "hour" || filters.payUnit === "day") {
    builder = builder.eq("compensation_unit", filters.payUnit);
  }

  if (filters.startRangeMonths) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() + filters.startRangeMonths);
    builder = builder
      .gte("begins_at", now.toISOString())
      .lte("begins_at", cutoff.toISOString());
  }

  const location = filters.location ? sanitizeSearchTerm(filters.location) : "";
  if (location) builder = builder.ilike("location_display", `%${location}%`);

  if (filters.startDateAfter) {
    builder = builder.gte("begins_at", filters.startDateAfter);
  }
  if (filters.startDateBefore) {
    builder = builder.lte("begins_at", filters.startDateBefore);
  }

  const limit = filters.limit ?? DEFAULT_SEARCH_LIMIT;
  const ordered = builder.order("published_at", { ascending: false });
  const hasOffset =
    filters.offset != null && Number.isFinite(filters.offset) && filters.offset >= 0;
  const paginated = hasOffset
    ? ordered.range(filters.offset as number, (filters.offset as number) + limit - 1)
    : ordered.limit(limit);

  const { data, error } = await paginated;

  if (error) throw new Error(`searchListings: ${error.message}`);
  return ((data ?? []) as unknown as RawListingRow[]).map(toListingRow);
}

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
  if (error) throw new Error(`resolveHostProfileId: ${error.message}`);
  return data ? (data as { id: string }).id : null;
}

export async function getHostListings(
  clerkToken: string,
  clerkUserId: string,
): Promise<ListingRow[]> {
  const hostProfileId = await resolveHostProfileId(clerkToken, clerkUserId);
  if (!hostProfileId) return [];

  const { data, error } = await authedClient(clerkToken)
    .from("listings")
    .select(LISTING_COLUMNS)
    .eq("host_profile_id", hostProfileId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`getHostListings: ${error.message}`);
  return ((data ?? []) as unknown as RawListingRow[]).map(toListingRow);
}

export interface ListingWriteFields {
  title?: string;
  category?: OpportunityCategory;
  locationName?: string | null;
  housingProvision?: BenefitProvision;
  housingDescription?: string | null;
  mealsProvision?: BenefitProvision;
  mealsDescription?: string | null;
  payMin?: number | null;
  payMax?: number | null;
  payCurrency?: string | null;
  payPeriod?: CompensationUnit | null;
  summary?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  coverPhotoUrl?: string | null;
  galleryUrls?: string[] | null;
}

type ListingColumnPatch = {
  title?: string;
  category?: OpportunityCategory;
  location_display?: string | null;
  description?: string | null;
  begins_at?: string | null;
  ends_at?: string | null;
  compensation_min_cents?: number | null;
  compensation_max_cents?: number | null;
  compensation_currency?: string;
  compensation_unit?: CompensationUnit | null;
  housing_included?: boolean;
  meals_included?: boolean;
  housing_description?: string | null;
  meals_description?: string | null;
  cover_photo_url?: string | null;
  gallery_photo_urls?: string[];
};

function toCentsOrNull(amount: number | null | undefined): number | null {
  if (amount == null || !Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

function benefitIncluded(
  provision: BenefitProvision | undefined,
  description: string | null | undefined,
): boolean {
  if (provision !== undefined) return provision !== "not_provided";
  return typeof description === "string" && description.trim().length > 0;
}

function buildListingColumnPatch(fields: ListingWriteFields): ListingColumnPatch {
  const patch: ListingColumnPatch = {};

  if (fields.title !== undefined) patch.title = fields.title.trim();
  if (fields.category !== undefined) patch.category = fields.category;

  if (fields.locationName !== undefined) {
    const trimmed = fields.locationName?.trim() ?? "";
    patch.location_display = trimmed.length > 0 ? trimmed : null;
  }
  if (fields.summary !== undefined) {
    const trimmed = fields.summary?.trim() ?? "";
    patch.description = trimmed.length > 0 ? trimmed : null;
  }
  if (fields.startDate !== undefined) {
    patch.begins_at = fields.startDate && fields.startDate.length > 0 ? fields.startDate : null;
  }
  if (fields.endDate !== undefined) {
    patch.ends_at = fields.endDate && fields.endDate.length > 0 ? fields.endDate : null;
  }
  if (fields.payMin !== undefined) patch.compensation_min_cents = toCentsOrNull(fields.payMin);
  if (fields.payMax !== undefined) patch.compensation_max_cents = toCentsOrNull(fields.payMax);
  if (fields.payCurrency != null && fields.payCurrency.trim().length > 0) {
    patch.compensation_currency = fields.payCurrency.trim().toUpperCase();
  }
  if (fields.payPeriod != null) patch.compensation_unit = fields.payPeriod;
  if (fields.housingDescription !== undefined) {
    const trimmed = fields.housingDescription?.trim() ?? "";
    patch.housing_description = trimmed.length > 0 ? trimmed : null;
  }
  if (fields.mealsDescription !== undefined) {
    const trimmed = fields.mealsDescription?.trim() ?? "";
    patch.meals_description = trimmed.length > 0 ? trimmed : null;
  }
  if (fields.housingProvision !== undefined || fields.housingDescription !== undefined) {
    patch.housing_included = benefitIncluded(fields.housingProvision, fields.housingDescription);
  }
  if (fields.mealsProvision !== undefined || fields.mealsDescription !== undefined) {
    patch.meals_included = benefitIncluded(fields.mealsProvision, fields.mealsDescription);
  }
  if (fields.coverPhotoUrl !== undefined) {
    const trimmed = fields.coverPhotoUrl?.trim() ?? "";
    patch.cover_photo_url = trimmed.length > 0 ? trimmed : null;
  }
  if (fields.galleryUrls !== undefined) {
    patch.gallery_photo_urls = fields.galleryUrls ?? [];
  }

  return patch;
}

export async function createListing(
  clerkToken: string,
  clerkUserId: string,
  fields: ListingWriteFields,
): Promise<{ ok: boolean; listingId?: string; error?: string }> {
  const title = fields.title?.trim() ?? "";
  if (title.length === 0) return { ok: false, error: "A listing title is required." };
  if (!fields.category) return { ok: false, error: "Choose a valid category for the listing." };

  const hostProfileId = await resolveHostProfileId(clerkToken, clerkUserId);
  if (!hostProfileId) {
    return { ok: false, error: "No host profile found for your account. Create a host profile first." };
  }

  const patch = buildListingColumnPatch(fields);
  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data, error } = await untyped
    .from("listings")
    .insert({ ...patch, title, host_profile_id: hostProfileId, status: "draft" })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not create the listing." };
  }
  return { ok: true, listingId: (data as { id: string }).id };
}

export async function updateListing(
  clerkToken: string,
  clerkUserId: string,
  listingId: string,
  fields: ListingWriteFields,
): Promise<{ ok: boolean; error?: string }> {
  if (!listingId) return { ok: false, error: "Missing listing id." };

  const hostProfileId = await resolveHostProfileId(clerkToken, clerkUserId);
  if (!hostProfileId) return { ok: false, error: "No host profile found for your account." };

  const patch = buildListingColumnPatch(fields);
  if (Object.keys(patch).length === 0) return { ok: true };

  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data, error } = await untyped
    .from("listings")
    .update(patch)
    .eq("id", listingId)
    .eq("host_profile_id", hostProfileId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Listing not found or you do not have access to it." };
  return { ok: true };
}

/**
 * NOTE: listing status transitions are owned by the canonical
 * `updateListingStatus` in ./listingLifecycle.ts — it validates the transition
 * against LISTING_STATUS_TRANSITIONS and stamps published_at / paused_at /
 * archived_at. The earlier duplicate that lived here (status-only, no
 * validation, no timestamps) was removed; the action layer now calls the
 * canonical fn (re-exported from the package index).
 */

/* ========================================================================== */
/* Wave 10 — public listing detail + per-seeker state queries                 */
/* ========================================================================== */

/**
 * Joined host_profiles fields on a public listing detail. id is needed to
 * link /host/{id} and generate hiringOrganization JSON-LD.
 */
export interface PublicListingDetailHost {
  id: string;
  companyName: string;
  photoUrl: string | null;
  about: string | null;
  primaryLocationName: string | null;
  attestationStatus: string;
}

/**
 * A single listing for the public detail page, joined to its host_profiles row.
 *
 * Does NOT filter on status — the page layer decides visibility (non-live
 * listings are only shown to the owning host). Uses the anon client.
 */
export interface PublicListingDetail {
  id: string;
  title: string;
  category: OpportunityCategory;
  description: string | null;
  locationDisplay: string | null;
  latitude: number | null;
  longitude: number | null;
  status: ListingStatus;
  housingIncluded: boolean;
  mealsIncluded: boolean;
  compensationSummary: string | null;
  compensationMinCents: number | null;
  compensationMaxCents: number | null;
  compensationUnit: string | null;
  compensationCurrency: string;
  timelineSummary: string | null;
  beginsAt: string | null;
  endsAt: string | null;
  publishedAt: string | null;
  coverPhotoUrl: string | null;
  galleryPhotoUrls: string[];
  hostProfileId: string | null;
  host: PublicListingDetailHost | null;
}

const LISTING_DETAIL_COLUMNS =
  "id,title,category,description,location_display,latitude,longitude,status," +
  "housing_included,meals_included,compensation_summary,compensation_min_cents," +
  "compensation_max_cents,compensation_unit,compensation_currency,timeline_summary," +
  "begins_at,ends_at,published_at,cover_photo_url,gallery_photo_urls,host_profile_id," +
  "host_profiles(id,company_name,photo_url,about,primary_location_name,attestation_status)";

function firstEmbed(value: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === "object"
    ? (candidate as Record<string, unknown>)
    : null;
}

/**
 * Fetch a listing for the public detail page. No status filter — the page
 * decides who may view non-live listings. Anon client (no auth required).
 */
export async function getListingDetailPublic(
  listingId: string,
): Promise<PublicListingDetail | null> {
  const db = anonClient() as unknown as SupabaseClient;
  const { data, error } = await db
    .from("listings")
    .select(LISTING_DETAIL_COLUMNS)
    .eq("id", listingId)
    .maybeSingle();

  if (error) throw new Error(`getListingDetailPublic: ${error.message}`);
  if (!data) return null;

  const row = data as unknown as Record<string, unknown>;
  const hostRow = firstEmbed(row.host_profiles);

  const host: PublicListingDetailHost | null = hostRow
    ? {
        id: String(hostRow.id ?? row.host_profile_id ?? ""),
        companyName:
          typeof hostRow.company_name === "string" ? hostRow.company_name : "",
        photoUrl:
          typeof hostRow.photo_url === "string" ? hostRow.photo_url : null,
        about: typeof hostRow.about === "string" ? hostRow.about : null,
        primaryLocationName:
          typeof hostRow.primary_location_name === "string"
            ? hostRow.primary_location_name
            : null,
        attestationStatus:
          typeof hostRow.attestation_status === "string"
            ? hostRow.attestation_status
            : "not_attested",
      }
    : null;

  return {
    id: String(row.id),
    title: typeof row.title === "string" ? row.title : "",
    category: (typeof row.category === "string"
      ? row.category
      : "mix") as OpportunityCategory,
    description:
      typeof row.description === "string" ? row.description : null,
    locationDisplay:
      typeof row.location_display === "string" ? row.location_display : null,
    latitude: typeof row.latitude === "number" ? row.latitude : null,
    longitude: typeof row.longitude === "number" ? row.longitude : null,
    status: (typeof row.status === "string"
      ? row.status
      : "draft") as ListingStatus,
    housingIncluded: row.housing_included === true,
    mealsIncluded: row.meals_included === true,
    compensationSummary:
      typeof row.compensation_summary === "string"
        ? row.compensation_summary
        : null,
    compensationMinCents:
      typeof row.compensation_min_cents === "number"
        ? row.compensation_min_cents
        : null,
    compensationMaxCents:
      typeof row.compensation_max_cents === "number"
        ? row.compensation_max_cents
        : null,
    compensationUnit:
      typeof row.compensation_unit === "string" ? row.compensation_unit : null,
    compensationCurrency:
      typeof row.compensation_currency === "string"
        ? row.compensation_currency
        : "USD",
    timelineSummary:
      typeof row.timeline_summary === "string" ? row.timeline_summary : null,
    beginsAt: typeof row.begins_at === "string" ? row.begins_at : null,
    endsAt: typeof row.ends_at === "string" ? row.ends_at : null,
    publishedAt:
      typeof row.published_at === "string" ? row.published_at : null,
    coverPhotoUrl:
      typeof row.cover_photo_url === "string" ? row.cover_photo_url : null,
    galleryPhotoUrls: Array.isArray(row.gallery_photo_urls)
      ? (row.gallery_photo_urls as unknown[]).filter(
          (u): u is string => typeof u === "string",
        )
      : [],
    hostProfileId:
      typeof row.host_profile_id === "string" ? row.host_profile_id : null,
    host,
  };
}

/**
 * Resolve seeker_profiles.id for the authed Clerk user.
 * Internal helper shared by hasApplied / hasSaved.
 */
async function resolveSeekerProfileIdForListings(
  clerkToken: string,
  clerkUserId: string,
): Promise<string | null> {
  const db = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data, error } = await db
    .from("seeker_profiles")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (error) throw new Error(`resolveSeekerProfileIdForListings: ${error.message}`);
  return data ? String((data as { id: string }).id) : null;
}

/**
 * Whether the authed seeker has an active (non-withdrawn) application to a
 * listing. Returns false when the seeker has no profile yet.
 * `clerkUserId` must come from auth().userId.
 */
export async function hasApplied(
  clerkToken: string,
  clerkUserId: string,
  listingId: string,
): Promise<boolean> {
  const seekerProfileId = await resolveSeekerProfileIdForListings(
    clerkToken,
    clerkUserId,
  );
  if (!seekerProfileId) return false;

  const db = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data, error } = await db
    .from("applications")
    .select("id")
    .eq("seeker_profile_id", seekerProfileId)
    .eq("listing_id", listingId)
    .neq("status", "withdrawn")
    .maybeSingle();
  if (error) throw new Error(`hasApplied: ${error.message}`);
  return Boolean(data);
}

/**
 * Whether the authed seeker has actively saved a listing (status='saved').
 * `clerkUserId` must come from auth().userId.
 */
export async function hasSaved(
  clerkToken: string,
  clerkUserId: string,
  listingId: string,
): Promise<boolean> {
  const seekerProfileId = await resolveSeekerProfileIdForListings(
    clerkToken,
    clerkUserId,
  );
  if (!seekerProfileId) return false;

  const db = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data, error } = await db
    .from("saved_listings")
    .select("listing_id")
    .eq("seeker_profile_id", seekerProfileId)
    .eq("listing_id", listingId)
    .eq("status", "saved")
    .maybeSingle();
  if (error) throw new Error(`hasSaved: ${error.message}`);
  return Boolean(data);
}

/**
 * Distinct host_profile_id values with at least one live listing.
 * Used to populate host-profile entries in the sitemap. Anon client.
 */
export async function getHostIdsWithLiveListings(): Promise<string[]> {
  const db = anonClient() as unknown as SupabaseClient;
  const { data, error } = await db
    .from("listings")
    .select("host_profile_id")
    .eq("status", "live");
  if (error) throw new Error(`getHostIdsWithLiveListings: ${error.message}`);

  const ids = new Set<string>();
  for (const raw of (data ?? []) as Array<{ host_profile_id: string | null }>) {
    if (raw.host_profile_id) ids.add(raw.host_profile_id);
  }
  return [...ids];
}
