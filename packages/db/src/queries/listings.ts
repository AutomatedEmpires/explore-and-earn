import type { BenefitProvision, OpportunityCategory } from "@explore-and-earn/contracts";
import { anonClient, authedClient } from "../client";

export interface ListingRow {
  id: string;
  title: string;
  category: OpportunityCategory;
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
  host_profiles: {
    company_name: string;
    attestation_status: string;
  } | null;
}

type RawListingRow = {
  id: string;
  title: string;
  category: string;
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
  host_profiles: { company_name: string; attestation_status: string } | null;
};

function formatOpportunityWindow(
  row: Pick<ListingRow, "begins_at" | "ends_at" | "timeline_summary">,
): string {
  if (row.timeline_summary) return row.timeline_summary;
  if (row.begins_at && row.ends_at) {
    const fmt = (d: string) =>
      new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" });
    return `${fmt(row.begins_at)}–${fmt(row.ends_at)}`;
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
    const range = max && max !== min ? `${min}–${max}` : min;
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
  };
}

const LISTING_COLUMNS =
  "id,title,category,location_display,latitude,longitude,status,housing_included,meals_included,compensation_summary,compensation_min_cents,compensation_max_cents,compensation_unit,compensation_currency,timeline_summary,begins_at,ends_at,published_at,host_profiles(company_name,attestation_status)";

/** Public live listings — no auth required. */
export async function getPublicListings(): Promise<ListingRow[]> {
  const { data, error } = await anonClient()
    .from("listings")
    .select(LISTING_COLUMNS)
    .eq("status", "live")
    .order("published_at", { ascending: false });

  if (error) throw new Error(`getPublicListings: ${error.message}`);
  return ((data ?? []) as unknown as RawListingRow[]).map(toListingRow);
}

/** Single live listing by id — no auth required. */
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

/** Host's own listings — requires Clerk JWT. */
export async function getHostListings(clerkToken: string): Promise<ListingRow[]> {
  const { data, error } = await authedClient(clerkToken)
    .from("listings")
    .select(LISTING_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`getHostListings: ${error.message}`);
  return ((data ?? []) as unknown as RawListingRow[]).map(toListingRow);
}
