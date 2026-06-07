import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  BenefitProvision,
  CompensationUnit,
  OpportunityCategory,
} from "@explore-and-earn/contracts";
import { MARKETPLACE_CATEGORIES } from "@explore-and-earn/contracts";
import { anonClient, authedClient } from "../client";

export interface ListingRow {
  id: string;
  title: string;
  category: OpportunityCategory;
  description: string | null;
  location_display: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  housing_included: boolean;
  meals_included: boolean;
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
  host_profiles: {
    company_name: string;
    attestation_status: string;
  } | null;
}

type RawListingRow = {
  id: string;
  title: string;
  category: string;
  description: string | null;
  location_display: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  housing_included: boolean;
  meals_included: boolean;
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
export function rowToDiscoveryFields(row: ListingRow) {
  const hostName = row.host_profiles?.company_name ?? "Unknown Host";
  const verified = row.host_profiles?.attestation_status === "verified";

  const housingProvision: BenefitProvision = row.housing_included ? "provided" : "not_provided";
  const mealsProvision: BenefitProvision = row.meals_included ? "provided" : "not_provided";

  return {
    id: row.id,
    title: row.title,
    category: row.category,
    location: row.location_display ?? "Location not specified",
    opportunityWindow: formatOpportunityWindow(row),
    status: row.status as "live" | "draft" | "paused" | "closed" | "archived" | "under_review",
    host: { name: hostName, verified },
    benefits: {
      housing: { provision: housingProvision },
      meals: { provision: mealsProvision },
      pay: {
        provision: "provided" as BenefitProvision,
        summary: buildCompensationSummary(row),
      },
    },
    coverImageUrl: row.cover_photo_url ?? undefined,
  };
}

const LISTING_COLUMNS =
  "id,title,category,description,location_display,latitude,longitude,status,housing_included,meals_included,compensation_summary,compensation_min_cents,compensation_max_cents,compensation_unit,compensation_currency,timeline_summary,begins_at,ends_at,published_at,cover_photo_url,host_profiles(company_name,attestation_status)";

/** Public live listings \u2014 no auth required. */
export async function getPublicListings(): Promise<ListingRow[]> {
  const { data, error } = await anonClient()
    .from("listings")
    .select(LISTING_COLUMNS)
    .eq("status", "live")
    .order("published_at", { ascending: false });

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
 *
 * - Returns [] for an empty id list \u2014 PostgREST `.in(...)` with an empty array
 *   is invalid, so the guard is required.
 * - Filters on status "live", matching getPublicListingById. (There is no
 *   "published" status in this schema; "live" is the published state \u2014 see
 *   contracts LISTING_STATUS / supabase/migrations/006_listings.sql.)
 * - Result order is NOT guaranteed; callers that need a specific order should
 *   join the rows back by id (e.g. via a Map).
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
 * Filters accepted by {@link searchListings}. Every field is optional; an empty
 * filter object returns the newest live listings (the same set as
 * getPublicListings, capped by `limit`).
 */
export interface SearchFilters {
  /** Free text, matched case-insensitively against title, description, and location_display. */
  query?: string;
  /** Subset of MARKETPLACE_CATEGORIES; values outside the registry are ignored. */
  categories?: string[];
  /** When true, only listings that include housing (housing_included = true). */
  hasHousing?: boolean;
  /** When true, only listings that include meals (meals_included = true). */
  hasMeals?: boolean;
  /** Minimum pay floor in MAJOR currency units (e.g. dollars); compared to compensation_min_cents. */
  payMin?: number;
  /** Partial, case-insensitive match against location_display. */
  location?: string;
  /** Max rows to return (default 48). */
  limit?: number;
}

const DEFAULT_SEARCH_LIMIT = 48;

/**
 * Strip characters that would break a PostgREST `or()` / `ilike` filter
 * expression: commas and parentheses are structural in the or() grammar and
 * `*` is the wildcard token. Whitespace is collapsed and trimmed. Returns ""
 * when nothing usable remains, in which case the caller skips that filter.
 */
function sanitizeSearchTerm(term: string): string {
  return term.slice(0, 200).replace(/[,()*%]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Public, server-side search over live listings \u2014 no auth required (anon
 * client, same trust level as getPublicListings).
 *
 * SCHEMA NOTE: the 006_listings.sql `listings` table does NOT have the
 * `summary` / `primary_location_name` / `housing_description` /
 * `meals_description` / `pay_min` columns referenced in some early specs. This
 * implementation maps those intents onto the real columns:
 *   - free text  -> title / description / location_display
 *   - location   -> location_display
 *   - housing    -> housing_included (boolean flag; there is no free-text column)
 *   - meals      -> meals_included (boolean flag)
 *   - pay floor  -> compensation_min_cents (integer cents; payMin is given in
 *                   major units and converted via Math.round(payMin * 100))
 */
export async function searchListings(filters: SearchFilters): Promise<ListingRow[]> {
  let builder = anonClient()
    .from("listings")
    .select(LISTING_COLUMNS)
    .eq("status", "live");

  const term = filters.query ? sanitizeSearchTerm(filters.query) : "";
  if (term) {
    builder = builder.or(
      `title.ilike.%${term}%,description.ilike.%${term}%,location_display.ilike.%${term}%`,
    );
  }

  const categories = (filters.categories ?? []).filter((category) =>
    (MARKETPLACE_CATEGORIES as readonly string[]).includes(category),
  );
  if (categories.length > 0) {
    builder = builder.in("category", categories);
  }

  if (filters.hasHousing) {
    builder = builder.eq("housing_included", true);
  }
  if (filters.hasMeals) {
    builder = builder.eq("meals_included", true);
  }

  if (
    filters.payMin != null &&
    Number.isFinite(filters.payMin) &&
    filters.payMin > 0
  ) {
    builder = builder.gte("compensation_min_cents", Math.round(filters.payMin * 100));
  }

  const location = filters.location ? sanitizeSearchTerm(filters.location) : "";
  if (location) {
    builder = builder.ilike("location_display", `%${location}%`);
  }

  const limit = filters.limit ?? DEFAULT_SEARCH_LIMIT;

  const { data, error } = await builder
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`searchListings: ${error.message}`);
  return ((data ?? []) as unknown as RawListingRow[]).map(toListingRow);
}

/**
 * Resolve the host_profiles.id for the authenticated Clerk user.
 * Returns null when the user has no host profile yet.
 *
 * `clerkUserId` must come from `auth().userId` \u2014 never decoded from the token.
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
  if (error) throw new Error(`resolveHostProfileId: ${error.message}`);
  return data ? (data as { id: string }).id : null;
}

/**
 * Host's own listings \u2014 requires Clerk JWT + verified Clerk user id.
 *
 * Scoped to `host_profile_id` so a host can only read their own listings.
 * `clerkUserId` must come from `auth().userId`.
 */
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

/**
 * Field shape accepted by createListing / updateListing.
 *
 * Money note: `payMin` / `payMax` are MAJOR currency units (e.g. dollars), not
 * cents. They are converted to the integer `compensation_*_cents` columns via
 * Math.round(amount * 100) to satisfy the 006_listings.sql CHECK (>= 0).
 *
 * Housing / Meals note: 006_listings.sql has no free-text housing/meals column \u2014
 * only the boolean `housing_included` / `meals_included` flags. A provided or
 * partial provision (or any non-empty description) flips the flag to true; the
 * free-text description itself is NOT persisted yet. Flagged for schema
 * follow-up.
 */
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
  cover_photo_url?: string | null;
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

/**
 * Map the public ListingWriteFields into `listings` table columns. Only keys
 * that are present on `fields` are emitted, so the same builder serves create
 * (full) and update (partial) writes.
 */
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

  return patch;
}

/**
 * Create a draft listing owned by the authenticated host.
 *
 * `clerkUserId` must come from `auth().userId` \u2014 never decoded from the token.
 * The listing is always inserted with status 'draft'.
 */
export async function createListing(
  clerkToken: string,
  clerkUserId: string,
  fields: ListingWriteFields,
): Promise<{ ok: boolean; listingId?: string; error?: string }> {
  const title = fields.title?.trim() ?? "";
  if (title.length === 0) {
    return { ok: false, error: "A listing title is required." };
  }
  if (!fields.category) {
    return { ok: false, error: "Choose a valid category for the listing." };
  }

  const hostProfileId = await resolveHostProfileId(clerkToken, clerkUserId);
  if (!hostProfileId) {
    return {
      ok: false,
      error: "No host profile found for your account. Create a host profile first.",
    };
  }

  const patch = buildListingColumnPatch(fields);
  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data, error } = await untyped
    .from("listings")
    .insert({
      ...patch,
      title,
      host_profile_id: hostProfileId,
      status: "draft",
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not create the listing." };
  }
  return { ok: true, listingId: (data as { id: string }).id };
}

/**
 * Update an existing listing the caller owns.
 *
 * Ownership is enforced directly in the query:
 * UPDATE ... WHERE id = listingId AND host_profile_id = <caller's profile>.
 * A row the host does not own simply matches nothing and returns an error.
 *
 * `clerkUserId` must come from `auth().userId`.
 */
export async function updateListing(
  clerkToken: string,
  clerkUserId: string,
  listingId: string,
  fields: ListingWriteFields,
): Promise<{ ok: boolean; error?: string }> {
  if (!listingId) {
    return { ok: false, error: "Missing listing id." };
  }

  const hostProfileId = await resolveHostProfileId(clerkToken, clerkUserId);
  if (!hostProfileId) {
    return { ok: false, error: "No host profile found for your account." };
  }

  const patch = buildListingColumnPatch(fields);
  if (Object.keys(patch).length === 0) {
    return { ok: true };
  }

  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data, error } = await untyped
    .from("listings")
    .update(patch)
    .eq("id", listingId)
    .eq("host_profile_id", hostProfileId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data) {
    return { ok: false, error: "Listing not found or you do not have access to it." };
  }
  return { ok: true };
}
