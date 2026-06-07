import type { SupabaseClient } from "@supabase/supabase-js";

import { authedClient } from "./client";

/** Untyped Supabase handle (same pattern used across queries/*). */
function untypedClient(clerkToken: string): SupabaseClient {
  return authedClient(clerkToken) as unknown as SupabaseClient;
}

/**
 * Resolve all host_profile ids for the authed Clerk user.
 * Most hosts have a single profile; the array guards the general case.
 */
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

/**
 * Listing counts keyed by DB status (live, draft, paused, closed, archived,
 * under_review). Only statuses that appear in the host's listings are present.
 */
export interface ListingStatusCounts {
  readonly [status: string]: number;
}

/**
 * Applications submitted this calendar month, keyed by status.
 * Empty when the host has no listings or no recent applications.
 */
export interface ApplicationsByStage {
  readonly [status: string]: number;
}

export interface HostDashboardStats {
  /** Total listing counts per DB status (live, draft, paused…). */
  readonly listingsByStatus: ListingStatusCounts;
  /** Applications submitted in the current calendar month, grouped by status. */
  readonly applicationsThisMonth: ApplicationsByStage;
  /**
   * Count of items awaiting host action: applications in status `applied`
   * (not yet reviewed) plus invites in status `delivered` or `viewed`.
   */
  readonly pendingActions: number;
}

/**
 * Dashboard-level analytics for the authed host.
 *
 * `clerkUserId` MUST come from auth().userId — never decoded from a token.
 * Returns zeroed stats when the host has no profile row yet.
 */
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

  // Load listings, applications, and invites in parallel.
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

  // Listing counts by status.
  const listingsByStatus: Record<string, number> = {};
  for (const row of (listingResult.data ?? []) as Record<string, unknown>[]) {
    const s = typeof row.status === "string" ? row.status : "draft";
    listingsByStatus[s] = (listingsByStatus[s] ?? 0) + 1;
  }

  // Applications this month by status.
  const applicationsThisMonth: Record<string, number> = {};
  for (const row of (appResult.data ?? []) as Record<string, unknown>[]) {
    const s = typeof row.status === "string" ? row.status : "applied";
    applicationsThisMonth[s] = (applicationsThisMonth[s] ?? 0) + 1;
  }

  const pendingInvites = (inviteResult.data ?? []).length;

  // Re-query applied applications globally for an accurate pending count.
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

/** A single entry in the recent activity feed. */
export interface RecentActivity {
  readonly id: string;
  /** Discriminant for the feed item icon / colour. */
  readonly type: "application" | "invite_sent" | "listing_published";
  /** Short human-readable description of the activity. */
  readonly description: string;
  /** ISO-8601 timestamp. */
  readonly timestamp: string;
}

/**
 * The last 10 notable activities for the authed host across applications and
 * invites, sorted newest-first.
 *
 * `clerkUserId` MUST come from auth().userId.
 */
export async function getRecentActivityForHost(
  clerkToken: string,
  clerkUserId: string,
): Promise<RecentActivity[]> {
  const db = untypedClient(clerkToken);
  const hostProfileIds = await resolveHostProfileIds(db, clerkUserId);

  if (hostProfileIds.length === 0) {
    return [];
  }

  // Gather listing ids once.
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

  // Recent applications (last 20, we'll merge and slice to 10).
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

  // Recent invites sent.
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

  // Merge, sort newest-first, take 10.
  const all = [...appActivities, ...inviteActivities, ...recentPublished]
    .filter((item) => item.timestamp.length > 0)
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )
    .slice(0, 10);

  return all;
}
