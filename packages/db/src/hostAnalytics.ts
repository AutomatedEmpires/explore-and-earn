import type { SupabaseClient } from "@supabase/supabase-js";

import { authedClient } from "./client";

/** Untyped Supabase handle (same pattern used across queries/*). */
function untypedClient(clerkToken: string): SupabaseClient {
  return authedClient(clerkToken) as unknown as SupabaseClient;
}

async function resolveHostProfileIds(
  db: SupabaseClient,
  clerkUserId: string,
): Promise<string[]> {
  const { data, error } = await db
    .from("host_profiles")
    .select("id")
    .eq("clerk_user_id", clerkUserId);
  if (error || !data) {
    return [];
  }
  return (data as Record<string, unknown>[]).map((r) => String(r.id));
}

export interface ListingStatusCounts {
  readonly [status: string]: number;
}

export interface ApplicationsByStage {
  readonly [status: string]: number;
}

export interface HostDashboardStats {
  readonly listingsByStatus: ListingStatusCounts;
  readonly applicationsThisMonth: ApplicationsByStage;
  readonly pendingActions: number;
}

export interface HostPerListingStats {
  readonly listingId: string;
  readonly listingTitle: string;
  readonly listingStatus: string;
  readonly applicationsByStatus: ApplicationsByStage;
  readonly totalApplications: number;
  readonly invitesSent: number;
  readonly invitesAccepted: number;
}

export interface HostAnalytics {
  readonly totalApplicationsByStatus: ApplicationsByStage;
  readonly activeListingCount: number;
  /** Accepted invites divided by total sent, from 0 to 1. */
  readonly inviteAcceptanceRate: number;
  readonly perListingStats: HostPerListingStats[];
}

/**
 * Full host analytics for dashboard UI wiring.
 *
 * `clerkUserId` MUST come from auth().userId — never decoded from a token.
 * Returns zeroed analytics when the host has no profile row yet.
 */
export async function getHostAnalytics(
  clerkToken: string,
  clerkUserId: string,
): Promise<HostAnalytics> {
  const db = untypedClient(clerkToken);
  const hostProfileIds = await resolveHostProfileIds(db, clerkUserId);

  if (hostProfileIds.length === 0) {
    return {
      totalApplicationsByStatus: {},
      activeListingCount: 0,
      inviteAcceptanceRate: 0,
      perListingStats: [],
    };
  }

  const { data: listingRows } = await db
    .from("listings")
    .select("id, title, status")
    .in("host_profile_id", hostProfileIds);

  const listings = ((listingRows ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    title: typeof row.title === "string" ? row.title : "Listing",
    status: typeof row.status === "string" ? row.status : "draft",
  }));
  const listingIds = listings.map((listing) => listing.id);

  if (listingIds.length === 0) {
    return {
      totalApplicationsByStatus: {},
      activeListingCount: 0,
      inviteAcceptanceRate: 0,
      perListingStats: [],
    };
  }

  const [appResult, inviteResult] = await Promise.all([
    db
      .from("applications")
      .select("id, listing_id, status")
      .in("listing_id", listingIds),
    db
      .from("invites")
      .select("id, listing_id, status")
      .in("host_profile_id", hostProfileIds),
  ]);

  const totalApplicationsByStatus: Record<string, number> = {};
  const applicationsByListing = new Map<string, Record<string, number>>();
  for (const row of (appResult.data ?? []) as Record<string, unknown>[]) {
    const listingId = String(row.listing_id);
    const status = typeof row.status === "string" ? row.status : "applied";
    totalApplicationsByStatus[status] = (totalApplicationsByStatus[status] ?? 0) + 1;
    const perListing = applicationsByListing.get(listingId) ?? {};
    perListing[status] = (perListing[status] ?? 0) + 1;
    applicationsByListing.set(listingId, perListing);
  }

  const invitesByListing = new Map<string, { sent: number; accepted: number }>();
  let totalInvites = 0;
  let acceptedInvites = 0;
  for (const row of (inviteResult.data ?? []) as Record<string, unknown>[]) {
    const listingId = String(row.listing_id);
    const status = typeof row.status === "string" ? row.status : "created";
    const accepted = status === "applied" || status === "accepted";
    totalInvites += 1;
    if (accepted) acceptedInvites += 1;
    const current = invitesByListing.get(listingId) ?? { sent: 0, accepted: 0 };
    current.sent += 1;
    if (accepted) current.accepted += 1;
    invitesByListing.set(listingId, current);
  }

  const perListingStats = listings.map((listing) => {
    const applicationsByStatus = applicationsByListing.get(listing.id) ?? {};
    const inviteStats = invitesByListing.get(listing.id) ?? { sent: 0, accepted: 0 };
    return {
      listingId: listing.id,
      listingTitle: listing.title,
      listingStatus: listing.status,
      applicationsByStatus,
      totalApplications: Object.values(applicationsByStatus).reduce(
        (sum, value) => sum + value,
        0,
      ),
      invitesSent: inviteStats.sent,
      invitesAccepted: inviteStats.accepted,
    } satisfies HostPerListingStats;
  });

  return {
    totalApplicationsByStatus,
    activeListingCount: listings.filter((listing) => listing.status === "live").length,
    inviteAcceptanceRate: totalInvites > 0 ? acceptedInvites / totalInvites : 0,
    perListingStats,
  };
}

export async function getHostDashboardStats(
  clerkToken: string,
  clerkUserId: string,
): Promise<HostDashboardStats> {
  const db = untypedClient(clerkToken);
  const hostProfileIds = await resolveHostProfileIds(db, clerkUserId);

  if (hostProfileIds.length === 0) {
    return {
      listingsByStatus: {},
      applicationsThisMonth: {},
      pendingActions: 0,
    };
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [listingResult, appResult, inviteResult] = await Promise.all([
    db
      .from("listings")
      .select("id, status")
      .in("host_profile_id", hostProfileIds),
    (async () => {
      const listingRes = await db
        .from("listings")
        .select("id")
        .in("host_profile_id", hostProfileIds);
      const listingIds = (
        (listingRes.data ?? []) as Record<string, unknown>[]
      ).map((r) => String(r.id));
      if (listingIds.length === 0) {
        return { data: [], error: null };
      }
      return db
        .from("applications")
        .select("id, status, submitted_at")
        .in("listing_id", listingIds)
        .gte("submitted_at", monthStart);
    })(),
    db
      .from("invites")
      .select("id, status")
      .in("host_profile_id", hostProfileIds)
      .in("status", ["delivered", "viewed"]),
  ]);

  const listingsByStatus: Record<string, number> = {};
  for (const row of (listingResult.data ?? []) as Record<string, unknown>[]) {
    const s = typeof row.status === "string" ? row.status : "draft";
    listingsByStatus[s] = (listingsByStatus[s] ?? 0) + 1;
  }

  const applicationsThisMonth: Record<string, number> = {};
  for (const row of (appResult.data ?? []) as Record<string, unknown>[]) {
    const s = typeof row.status === "string" ? row.status : "applied";
    applicationsThisMonth[s] = (applicationsThisMonth[s] ?? 0) + 1;
  }

  const pendingInvites = (inviteResult.data ?? []).length;

  const listingIdsGlobal = (
    (listingResult.data ?? []) as Record<string, unknown>[]
  ).map((r) => String(r.id));

  let totalPendingApps = 0;
  if (listingIdsGlobal.length > 0) {
    const { data: pendingAppRows } = await db
      .from("applications")
      .select("id")
      .in("listing_id", listingIdsGlobal)
      .eq("status", "applied");
    totalPendingApps = (pendingAppRows ?? []).length;
  }

  return {
    listingsByStatus,
    applicationsThisMonth,
    pendingActions: totalPendingApps + pendingInvites,
  };
}

export interface RecentActivity {
  readonly id: string;
  readonly type: "application" | "invite_sent" | "listing_published";
  readonly description: string;
  readonly timestamp: string;
}

export async function getRecentActivityForHost(
  clerkToken: string,
  clerkUserId: string,
): Promise<RecentActivity[]> {
  const db = untypedClient(clerkToken);
  const hostProfileIds = await resolveHostProfileIds(db, clerkUserId);

  if (hostProfileIds.length === 0) {
    return [];
  }

  const { data: listingRows } = await db
    .from("listings")
    .select("id, title, published_at, status")
    .in("host_profile_id", hostProfileIds)
    .order("published_at", { ascending: false });

  const listingIds = (
    (listingRows ?? []) as Record<string, unknown>[]
  ).map((r) => String(r.id));

  const listingTitleById = new Map<string, string>();
  const recentPublished: RecentActivity[] = [];
  for (const row of (listingRows ?? []) as Record<string, unknown>[]) {
    const id = String(row.id);
    const title = typeof row.title === "string" ? row.title : "Listing";
    listingTitleById.set(id, title);
    const publishedAt =
      typeof row.published_at === "string" ? row.published_at : null;
    if (
      publishedAt &&
      (row.status === "live" || row.status === "under_review")
    ) {
      recentPublished.push({
        id: `listing-${id}`,
        type: "listing_published",
        description: `Listing published: ${title}`,
        timestamp: publishedAt,
      });
    }
  }

  const appActivities: RecentActivity[] = [];
  if (listingIds.length > 0) {
    const { data: appRows } = await db
      .from("applications")
      .select("id, listing_id, submitted_at")
      .in("listing_id", listingIds)
      .order("submitted_at", { ascending: false })
      .limit(20);

    for (const row of (appRows ?? []) as Record<string, unknown>[]) {
      const listingTitle =
        listingTitleById.get(String(row.listing_id)) ?? "a listing";
      appActivities.push({
        id: `app-${row.id}`,
        type: "application",
        description: `New application to ${listingTitle}`,
        timestamp:
          typeof row.submitted_at === "string" ? row.submitted_at : "",
      });
    }
  }

  const inviteActivities: RecentActivity[] = [];
  const { data: inviteRows } = await db
    .from("invites")
    .select("id, listing_id, created_at")
    .in("host_profile_id", hostProfileIds)
    .order("created_at", { ascending: false })
    .limit(20);

  for (const row of (inviteRows ?? []) as Record<string, unknown>[]) {
    const listingTitle =
      listingTitleById.get(String(row.listing_id)) ?? "a listing";
    inviteActivities.push({
      id: `invite-${row.id}`,
      type: "invite_sent",
      description: `Invite sent for ${listingTitle}`,
      timestamp: typeof row.created_at === "string" ? row.created_at : "",
    });
  }

  const all = [...appActivities, ...inviteActivities, ...recentPublished]
    .filter((item) => item.timestamp.length > 0)
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )
    .slice(0, 10);

  return all;
}
