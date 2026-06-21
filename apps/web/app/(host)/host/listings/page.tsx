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

import {
  HostListingsManager,
  HostSectionHeading,
  dbStatusToHostState,
  type HostListingItem,
} from "../../../../components/host";
import { EmptyState } from "../../../../components/discovery";
import styles from "./page.module.css";

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
  const token = await getToken({ template: "supabase" });
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

  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="Listings"
        description="Every opportunity you have posted, with live applicant counts. Filter by status to focus your pipeline."
        actionLabel="New listing"
        actionHref="/host/listings/new"
      />
      {withCounts.length > 0 ? (
        <HostListingsManager listings={withCounts} />
      ) : (
        <EmptyState
          title="No listings yet"
          message="Post your first opportunity to start receiving applicants."
        />
      )}
    </section>
  );
}
