import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  authedClient,
  getApplicationCountsByListing,
  getNewApplicationCountsByListing,
  getHostListings,
  getHostProfile,
  rowToDiscoveryFields,
  type ListingRow,
} from "@explore-and-earn/db";

import { MetricCard, MetricGrid, Chip } from "@explore-and-earn/ui";

import {
  HostListingsManager,
  HostSectionHeading,
  countListingsByState,
  dbStatusToHostState,
  type HostListingItem,
} from "../../../../components/host";
import { EmptyState } from "../../../../components/discovery";
import styles from "./page.module.css";

/**
 * Boost strategy fallback ladder — Enterprise fills first, Pro backfills empty
 * premium slots, Starter backfills only what is left without competing with
 * paid inventory. Mirrors the benchmark listingsView() "Boost strategy" panel.
 * Static copy: this explains the homepage-exposure logic; it drives nothing.
 */
const BOOST_TIERS = [
  {
    step: "1",
    tier: "Enterprise priority",
    pill: "First fill",
    body: "Paid Enterprise boosted cards surface first — rotated by category and match relevance across the homepage and matched feed.",
    tags: ["Homepage", "Matched feed", "Top carousel"],
  },
  {
    step: "2",
    tier: "Pro fallback",
    pill: "Second",
    body: "Pro listings backfill empty premium slots only when Enterprise inventory is insufficient, weighted by category and location fit.",
    tags: ["Weighted", "Category fit", "Location fit"],
  },
  {
    step: "3",
    tier: "Starter fallback",
    pill: "Last",
    body: "Starter can backfill unsold slots at lower weight, and never carries a premium badge that competes with paid boost inventory.",
    tags: ["Controlled", "Lower weight", "No premium badge"],
  },
] as const;

/**
 * Derive the listings command-strip metrics from the host's REAL listings +
 * applicant counts (never hardcoded), so the strip can never drift from the
 * inventory rendered below. Presentation only — no matching/scoring.
 */
function deriveListingMetrics(items: readonly HostListingItem[]) {
  const counts = countListingsByState(items);
  const active = counts.open + counts.partially_filled + counts.filled;
  const boostedUsed = items.filter(
    (item) =>
      item.state !== "draft" &&
      (item.listing.conditionalBadges?.includes("boosted") ?? false),
  ).length;
  const applications = items.reduce((sum, item) => sum + item.applicantCount, 0);
  const newApplications = items.reduce(
    (sum, item) => sum + item.newApplicantCount,
    0,
  );
  return {
    active,
    drafts: counts.draft,
    boostedUsed,
    applications,
    newApplications,
  };
}

export const metadata: Metadata = { title: "Listings" };

// Host listings are per-user (RLS-scoped) and must never be statically cached.
export const dynamic = "force-dynamic";

// Same columns as queries/listings.ts LISTING_COLUMNS but WITHOUT the
// host_profiles embedded join. Used only by the defensive fallback below if
// PostgREST rejects the relationship embed (named blocker in the build brief).
const LISTING_COLUMNS_NO_JOIN =
  "id,title,category,location_display,latitude,longitude,status,housing_included,meals_included,compensation_summary,compensation_min_cents,compensation_max_cents,compensation_unit,compensation_currency,timeline_summary,begins_at,ends_at,published_at";

function toItems(rows: readonly ListingRow[]): HostListingItem[] {
  return rows.map((row) => ({
    listing: rowToDiscoveryFields(row),
    state: dbStatusToHostState(row.status),
    // Applicant counts are merged in HostListingsPage from
    // getApplicationCountsByListing; default to zero until merged.
    applicantCount: 0,
    newApplicantCount: 0,
  }));
}

/**
 * Load the authed host's own listings (RLS-scoped) as HostListingItem[]. The
 * primary path is the shared getHostListings query. If PostgREST rejects the
 * host_profiles embedded join (the named blocker in the build brief), fall back
 * to a no-join select on the same authed client — queries/listings.ts is left
 * untouched. Non-join errors are rethrown so they are not masked as "empty".
 */
async function loadHostItems(token: string, userId: string): Promise<HostListingItem[]> {
  try {
    return toItems(await getHostListings(token, userId));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/host_profiles|relationship|embed|schema cache/i.test(message)) {
      throw error;
    }
    const hostProfile = await getHostProfile(token, userId);
    if (!hostProfile) return [];
    const db = authedClient(token) as unknown as SupabaseClient;
    const { data, error: fallbackError } = await db
      .from("listings")
      .select(LISTING_COLUMNS_NO_JOIN)
      .eq("host_profile_id", hostProfile.id)
      .order("created_at", { ascending: false });
    if (fallbackError) {
      throw new Error(`getHostListings fallback: ${fallbackError.message}`);
    }
    const rows = ((data ?? []) as unknown as Array<Record<string, unknown>>).map(
      (raw) => ({ ...raw, host_profiles: null }) as unknown as ListingRow,
    );
    return toItems(rows);
  }
}

function SignInToManage() {
  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="Listings"
        description="Sign in as a host to post opportunities and manage your applicant pipeline."
      />
      <EmptyState
        title="Sign in to manage listings"
        message="You need to be signed in as a host to view and manage your opportunities."
      />
    </section>
  );
}

export default async function HostListingsPage() {
  const { userId, getToken } = await auth();
  if (!userId) {
    return <SignInToManage />;
  }
  const token = await getToken();
  if (!token) {
    return <SignInToManage />;
  }

  // Listings (with embed/fallback) and real applicant counts are independent;
  // a counts failure must not break the listings view, so it degrades to {}.
  const [items, counts, newCounts] = await Promise.all([
    loadHostItems(token, userId),
    getApplicationCountsByListing(token, userId).catch(
      () => ({}) as Record<string, number>,
    ),
    getNewApplicationCountsByListing(token, userId).catch(
      () => ({}) as Record<string, number>,
    ),
  ]);

  const withCounts = items.map((item) => ({
    ...item,
    applicantCount: counts[item.listing.id] ?? 0,
    newApplicantCount: newCounts[item.listing.id] ?? 0,
  }));

  const metrics = deriveListingMetrics(withCounts);

  return (
    <section className={styles.block}>
      <HostSectionHeading
        eyebrow="Listings command"
        title="Listings"
        description="Every opportunity you have posted, with live applicant counts. Filter by status to focus your pipeline."
        actionLabel="New listing"
        actionHref="/host/listings/new"
      />

      {withCounts.length > 0 ? (
        <>
          <div className={styles.command}>
            <MetricGrid>
              <MetricCard
                label="Active"
                value={metrics.active}
                trend={metrics.active > 0 ? "Live" : "None live"}
                trendTone={metrics.active > 0 ? "up" : "down"}
              />
              <MetricCard
                label="Drafts"
                value={metrics.drafts}
                trend={metrics.drafts > 0 ? "Finish" : "Clear"}
                trendTone={metrics.drafts > 0 ? "neutral" : "down"}
              />
              <MetricCard
                label="Boosted"
                value={metrics.boostedUsed}
                trend={
                  metrics.boostedUsed > 0
                    ? metrics.active > 0
                      ? `of ${metrics.active} active`
                      : "Live"
                    : "None boosted"
                }
                trendTone={metrics.boostedUsed > 0 ? "up" : "neutral"}
              />
              <MetricCard
                label="Applications"
                value={metrics.applications}
                trend={
                  metrics.newApplications > 0
                    ? `+${metrics.newApplications} new`
                    : "Steady"
                }
                trendTone={metrics.newApplications > 0 ? "up" : "neutral"}
              />
            </MetricGrid>
          </div>

          <HostListingsManager listings={withCounts} />

          <section className={styles.command} aria-label="Boost strategy">
            <HostSectionHeading
              eyebrow="Boost strategy"
              title="Homepage exposure logic"
              description="Paid boosted slots surface first. Empty premium inventory falls back Enterprise → Pro → Starter, with clear visual distinction."
            />
            <div className={styles.boostGrid}>
              {BOOST_TIERS.map((tier, index) => (
                <article
                  key={tier.tier}
                  className={`${styles.boostCard}${
                    index === 0 ? ` ${styles.boostCardLead}` : ""
                  }`}
                >
                  <div className={styles.boostHead}>
                    <span className={styles.boostStep} aria-hidden="true">
                      {tier.step}
                    </span>
                    <Chip>{tier.pill}</Chip>
                  </div>
                  <h3 className={styles.boostTitle}>{tier.tier}</h3>
                  <p className={styles.boostBody}>{tier.body}</p>
                  <div className={styles.boostTags}>
                    {tier.tags.map((tag) => (
                      <Chip key={tag}>{tag}</Chip>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : (
        <EmptyState
          title="No listings yet"
          message="Post your first opportunity to start receiving applicants."
        />
      )}
    </section>
  );
}
