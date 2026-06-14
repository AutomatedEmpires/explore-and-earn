import "server-only";

import type { OpportunityCategory, OpportunityListing } from "@explore-and-earn/contracts";

import { anonClient } from "../client";
import { rowToDiscoveryFields, type ListingRow } from "./listings";

// Guard: return empty arrays if Supabase env vars aren't configured.
// Mirrors the pattern in apps/web/components/discovery/data.ts so the
// homepage renders the boost CTA fallback rather than throwing in local dev.
const hasDataConfig =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// ─── Slot limits ─────────────────────────────────────────────────────────────
// Desktop shows the full configured slot count; mobile uses the smaller value.
// Both views draw from the same ranked query — the component trims to its limit.

/** Max boosted listing cards shown on the homepage (desktop). */
export const HOMEPAGE_LISTING_SLOTS = 6;

/** Max boosted listing cards shown on the homepage (mobile). */
export const HOMEPAGE_LISTING_SLOTS_MOBILE = 4;

/** Max featured employer cards shown in the homepage rail (desktop). */
export const HOMEPAGE_EMPLOYER_SLOTS = 6;

/** Max featured employer cards shown in the homepage rail (mobile). */
export const HOMEPAGE_EMPLOYER_SLOTS_MOBILE = 4;

/**
 * Minimum boosted listings required to show the feed at all.
 * Below this the homepage renders a "Promote your listing" CTA instead.
 */
export const HOMEPAGE_MIN_BOOSTED_THRESHOLD = 1;

// ─── Types ───────────────────────────────────────────────────────────────────

export type BoostTier = "starter" | "professional" | "enterprise";

/** Tier → sort rank (lower = higher priority). */
const TIER_RANK: Record<BoostTier, number> = {
  enterprise: 0,
  professional: 1,
  starter: 2,
};

/** An OpportunityListing extended with boost metadata for the homepage. */
export type HomepageBoostedListing = ReturnType<typeof rowToDiscoveryFields> & {
  readonly conditionalBadges: readonly ["boosted"];
  readonly boostTier: BoostTier;
  readonly isPinned: boolean;
};

/** A featured employer entry for the homepage rail. */
export interface HomepageFeaturedEmployer {
  readonly hostId: string;
  readonly hostName: string;
  readonly listingId: string;
  readonly location: string;
  readonly listingCount: number;
  readonly verified: boolean;
  readonly tagline: string | undefined;
  readonly coverImageUrl: string | undefined;
  readonly category: OpportunityCategory;
  readonly boostTier: BoostTier;
  readonly isPinned: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tierRank(tier: string): number {
  return TIER_RANK[tier as BoostTier] ?? 99;
}

function cmpPriority(
  a: { is_pinned: boolean; pin_priority: number | null; tier: string },
  b: { is_pinned: boolean; pin_priority: number | null; tier: string },
): number {
  // Pinned items always surface above non-pinned
  if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
  // Within pinned: ascending pin_priority (lower = higher)
  if (a.is_pinned && b.is_pinned) {
    return (a.pin_priority ?? 9999) - (b.pin_priority ?? 9999);
  }
  // Non-pinned: Enterprise > Professional > Starter
  return tierRank(a.tier) - tierRank(b.tier);
}

// ─── Queries ─────────────────────────────────────────────────────────────────

/**
 * Returns homepage-eligible boosted listings, ranked:
 *   1. Pinned (ascending pin_priority — manual override)
 *   2. Enterprise
 *   3. Professional
 *   4. Starter
 *   Within tier: descending published_at (freshness)
 *
 * Employer diversity: at most 2 listings per host unless the campaign is
 * pinned. This prevents one employer from dominating all homepage slots.
 *
 * Returns an empty array when the DB tables do not exist yet (pre-migration)
 * or when no active campaigns cover the homepage surface.
 */
export async function getHomepageBoostedListings(
  limit = HOMEPAGE_LISTING_SLOTS,
): Promise<HomepageBoostedListing[]> {
  if (!hasDataConfig) return [];

  const client = anonClient();
  const now = new Date().toISOString();

  // listing_boost_campaigns is a new table not yet in the generated types.
  // We cast to `any` here; run `supabase gen types` after applying migration 029.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any)
    .from("listing_boost_campaigns")
    .select(
      `
      tier,
      is_pinned,
      pin_priority,
      listing:listings!inner (
        id, host_profile_id, title, category, description,
        location_display, latitude, longitude, status,
        housing_included, meals_included, visa_support,
        compensation_summary, compensation_min_cents, compensation_max_cents,
        compensation_unit, compensation_currency,
        timeline_summary, begins_at, ends_at, published_at,
        cover_photo_url,
        host_profiles ( company_name, attestation_status )
      )
    `,
    )
    .eq("status", "active")
    .lte("starts_at", now)
    .gte("ends_at", now)
    .contains("surfaces", ["homepage"])
    .eq("listing.status", "live");

  if (error || !data) return [];

  type CampaignRow = {
    tier: string;
    is_pinned: boolean;
    pin_priority: number | null;
    listing: ListingRow & { published_at: string | null };
  };

  const rows: CampaignRow[] = (data as CampaignRow[]).filter(
    (r) => r.listing !== null,
  );

  // Sort: pinned → tier → recency
  rows.sort((a, b) => {
    const tierCmp = cmpPriority(a, b);
    if (tierCmp !== 0) return tierCmp;
    return (b.listing.published_at ?? "").localeCompare(
      a.listing.published_at ?? "",
    );
  });

  // Employer diversity guard: max 2 listings per host (unless pinned)
  const employerCounts: Record<string, number> = {};
  const diversified = rows.filter((r) => {
    const hostId = r.listing.host_profile_id ?? "_unknown";
    if (r.is_pinned) return true;
    const count = employerCounts[hostId] ?? 0;
    if (count >= 2) return false;
    employerCounts[hostId] = count + 1;
    return true;
  });

  return diversified.slice(0, limit).map((r) => ({
    ...rowToDiscoveryFields(r.listing as ListingRow),
    conditionalBadges: ["boosted"] as const,
    boostTier: r.tier as BoostTier,
    isPinned: r.is_pinned,
  }));
}

/**
 * Returns homepage-eligible featured employers, ranked the same way as
 * boosted listings: pinned → Enterprise → Professional → Starter.
 *
 * Each employer entry includes a representative listing (the first live
 * listing for that host) and a live listing count.
 */
export async function getHomepageFeaturedEmployers(
  limit = HOMEPAGE_EMPLOYER_SLOTS,
): Promise<HomepageFeaturedEmployer[]> {
  if (!hasDataConfig) return [];

  const client = anonClient();
  const now = new Date().toISOString();

  // employer_featured_campaigns is also new — cast to `any` until types regen.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: campaigns, error } = await (client as any)
    .from("employer_featured_campaigns")
    .select(
      `
      tier,
      is_pinned,
      pin_priority,
      host:host_profiles!inner (
        id, company_name, tagline, primary_location_name,
        photo_url, attestation_status
      )
    `,
    )
    .eq("status", "active")
    .lte("starts_at", now)
    .gte("ends_at", now)
    .contains("surfaces", ["homepage"]);

  if (error || !campaigns?.length) return [];

  type CampaignRow = {
    tier: string;
    is_pinned: boolean;
    pin_priority: number | null;
    host: {
      id: string;
      company_name: string;
      tagline: string | null;
      primary_location_name: string | null;
      photo_url: string | null;
      attestation_status: string;
    };
  };

  const rows = (campaigns as CampaignRow[]).filter((c) => c.host !== null);

  // Fetch live listing counts + representative listing per host in one query.
  // cover_photo_url is a real column but absent from the generated types;
  // cast to `any` until `supabase gen types` is re-run after migration 029.
  const hostIds = rows.map((r) => r.host.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: listings } = await (client as any)
    .from("listings")
    .select("id, host_profile_id, category, cover_photo_url")
    .in("host_profile_id", hostIds)
    .eq("status", "live");

  type ListingMini = { id: string; host_profile_id: string | null; category: string; cover_photo_url: string | null };

  const listingsByHost = new Map<string, ListingMini[]>();
  for (const l of (listings ?? []) as ListingMini[]) {
    if (!l.host_profile_id) continue;
    const arr = listingsByHost.get(l.host_profile_id) ?? [];
    arr.push(l);
    listingsByHost.set(l.host_profile_id, arr);
  }

  rows.sort(cmpPriority);

  return rows.slice(0, limit).map((r) => {
    const hp = r.host;
    const hostListings = listingsByHost.get(hp.id) ?? [];
    const first = hostListings[0];
    return {
      hostId: hp.id,
      hostName: hp.company_name,
      listingId: first?.id ?? "",
      location: hp.primary_location_name ?? "",
      listingCount: hostListings.length,
      verified:
        hp.attestation_status === "attested" ||
        hp.attestation_status === "attested_stale",
      tagline: hp.tagline ?? undefined,
      coverImageUrl: first?.cover_photo_url ?? hp.photo_url ?? undefined,
      category: ((first?.category ?? "mix") as OpportunityCategory),
      boostTier: r.tier as BoostTier,
      isPinned: r.is_pinned,
    };
  });
}

/**
 * Homepage-only tier fallback: returns live listings ordered by host
 * subscription tier (Enterprise → Professional → Starter) when no active
 * boost campaigns cover the homepage surface.
 *
 * Used ONLY on the homepage — seek/swipe/map surfaces do NOT use this fallback.
 * Those surfaces rely solely on match score and weighting (host tier is one
 * signal in the match score, not an override of the result set).
 *
 * Applies the same employer-diversity guard as `getHomepageBoostedListings`:
 * at most 2 listings per host to prevent one employer dominating the feed.
 */
export async function getHomepageFallbackListings(
  limit = HOMEPAGE_LISTING_SLOTS,
): Promise<OpportunityListing[]> {
  if (!hasDataConfig) return [];

  const client = anonClient();

  // Fetch more than needed so diversity filtering can trim fairly.
  const fetchLimit = Math.min(limit * 4, 48);

  const { data, error } = await client
    .from("listings")
    .select(
      `id, host_profile_id, title, category, description,
       location_display, latitude, longitude, status,
       housing_included, meals_included, visa_support,
       compensation_summary, compensation_min_cents, compensation_max_cents,
       compensation_unit, compensation_currency,
       timeline_summary, begins_at, ends_at, published_at,
       cover_photo_url,
       host_profiles ( company_name, attestation_status, subscription_tier )`,
    )
    .eq("status", "live")
    .not("host_profile_id", "is", null)
    .order("published_at", { ascending: false })
    .limit(fetchLimit);

  if (error || !data) return [];

  type FallbackRow = ListingRow & {
    host_profiles: { company_name: string; attestation_status: string; subscription_tier: string } | null;
  };

  const rows = (data as unknown as FallbackRow[]).filter((r) => r.host_profiles !== null);

  // Sort by host subscription tier: Enterprise (0) → Professional (1) → Starter/other (2)
  rows.sort((a, b) => {
    const rankOf = (tier: string) => TIER_RANK[tier as BoostTier] ?? 99;
    const diff = rankOf(a.host_profiles!.subscription_tier) - rankOf(b.host_profiles!.subscription_tier);
    if (diff !== 0) return diff;
    // Within same tier: newest first
    return (b.published_at ?? "").localeCompare(a.published_at ?? "");
  });

  // Employer-diversity guard: max 2 listings per host (same rule as boosted feed)
  const employerCounts: Record<string, number> = {};
  const diversified = rows.filter((r) => {
    const hostId = r.host_profile_id ?? "_unknown";
    const count = employerCounts[hostId] ?? 0;
    if (count >= 2) return false;
    employerCounts[hostId] = count + 1;
    return true;
  });

  return diversified
    .slice(0, limit)
    .map((r) => rowToDiscoveryFields(r as ListingRow));
}
