import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { authedClient } from "./client";
import {
  derivePulse,
  emptyHostHiringPulse,
  pulseWindows,
  PULSE_WINDOW_DAYS,
  type HostHiringPulse,
  type PulseStamp,
} from "./lib/hostPulse";
import {
  listingReadiness,
  type ListingReadiness,
  type ListingReadinessInput,
} from "./lib/listingReadiness";

/**
 * Reads that exist for the host WORKSPACE and nowhere else.
 *
 * They live in their own module rather than in hostAnalytics.ts because they
 * answer a different question. hostAnalytics answers "how many, ever, and how
 * much of that is your plan entitled to see"; these answer "what changed, and
 * what is unfinished" — the two things a command centre is for and neither of
 * which the analytics layer models.
 *
 * `clerkUserId` MUST come from auth().userId, never decoded from a token —
 * the same rule the rest of the host read layer follows.
 */

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
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((row) => String(row.id));
}

function stamps(rows: unknown, column: string): PulseStamp[] {
  return ((rows ?? []) as Record<string, unknown>[]).map((row) => ({
    at: typeof row[column] === "string" ? (row[column] as string) : null,
  }));
}

/**
 * The host's recruiting activity over the last `days`, against the `days`
 * before that.
 *
 * Resilient in one direction only: a host with no profile or no listings gets
 * an UNMEASURABLE pulse (`measurable: false`), which the strip renders as a
 * teaching state rather than as four zeros with flat trends. A partial read
 * fault degrades the affected series to zero rather than failing the page,
 * because the overview has five other panels that are still true.
 */
export async function getHostHiringPulse(
  clerkToken: string,
  clerkUserId: string,
  days: number = PULSE_WINDOW_DAYS,
  nowMs: number = Date.now(),
): Promise<HostHiringPulse> {
  const windows = pulseWindows(nowMs, days);
  const db = untypedClient(clerkToken);
  const hostProfileIds = await resolveHostProfileIds(db, clerkUserId);
  if (hostProfileIds.length === 0) return emptyHostHiringPulse(days, nowMs);

  const { data: listingRows } = await db
    .from("listings")
    .select("id, published_at")
    .in("host_profile_id", hostProfileIds);

  const listings = (listingRows ?? []) as Record<string, unknown>[];
  const listingIds = listings.map((row) => String(row.id));
  if (listingIds.length === 0) return emptyHostHiringPulse(days, nowMs);

  // Only the two windows are fetched, not the host's whole history: the floor is
  // the previous window's start, which is the earliest row either count can use.
  const [appResult, inviteResult] = await Promise.all([
    db
      .from("applications")
      .select("id, submitted_at")
      .in("listing_id", listingIds)
      .gte("submitted_at", windows.previousFrom),
    db
      .from("invites")
      .select("id, created_at, responded_at, status")
      .in("host_profile_id", hostProfileIds)
      .gte("created_at", windows.previousFrom),
  ]);

  const inviteRows = (inviteResult.data ?? []) as Record<string, unknown>[];

  return derivePulse(
    {
      applications: stamps(appResult.data, "submitted_at"),
      invitesCreated: stamps(inviteRows, "created_at"),
      // An invite the seeker acted on. `applied` is the only status that means
      // they took it up — `accepted` is not in the invites CHECK constraint at
      // all, so counting it would be counting a value that cannot exist.
      invitesResponded: stamps(
        inviteRows.filter((row) => row.status === "applied"),
        "responded_at",
      ),
      listingsPublished: stamps(listings, "published_at"),
      hasListings: true,
    },
    windows,
  );
}

/** One listing, with everything the workspace needs to describe its health. */
export interface HostListingSignal {
  readonly listingId: string;
  readonly title: string;
  readonly status: string;
  readonly category: string;
  readonly coverPhotoUrl: string | null;
  readonly locationDisplay: string | null;
  readonly beginsAt: string | null;
  readonly endsAt: string | null;
  readonly publishedAt: string | null;
  /** `listings.expires_at` — the application deadline. */
  readonly expiresAt: string | null;
  readonly readiness: ListingReadiness;
}

const LISTING_SIGNAL_COLUMNS =
  "id,title,status,category,cover_photo_url,location_display,begins_at,ends_at," +
  "published_at,expires_at,provenance,housing_included,housing_evidence," +
  "meals_evidence,pay_evidence,compensation_min_cents,compensation_max_cents";

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function cents(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

/**
 * Health + deadline signals for every listing the host owns, keyed by id.
 *
 * A SEPARATE READ FROM `getHostListings` ON PURPOSE. That query's column list is
 * shared with the public discovery surfaces and does not carry `expires_at`;
 * widening it would change what every anonymous listing read pulls back. This
 * asks for exactly the columns the workspace needs, over the host's own rows.
 *
 * Returns an empty map on any fault — the listings page still renders its
 * inventory, just without health chips, which is the honest degradation.
 */
export async function getHostListingSignals(
  clerkToken: string,
  clerkUserId: string,
  nowMs: number = Date.now(),
): Promise<Map<string, HostListingSignal>> {
  const signals = new Map<string, HostListingSignal>();
  const db = untypedClient(clerkToken);
  const hostProfileIds = await resolveHostProfileIds(db, clerkUserId);
  if (hostProfileIds.length === 0) return signals;

  const { data, error } = await db
    .from("listings")
    .select(LISTING_SIGNAL_COLUMNS)
    .in("host_profile_id", hostProfileIds);
  if (error || !data) return signals;

  for (const raw of data as unknown as Record<string, unknown>[]) {
    const input: ListingReadinessInput = {
      status: typeof raw.status === "string" ? raw.status : "draft",
      provenance: text(raw.provenance),
      housingEvidence: text(raw.housing_evidence),
      housingIncluded:
        typeof raw.housing_included === "boolean" ? raw.housing_included : null,
      mealsEvidence: text(raw.meals_evidence),
      payEvidence: text(raw.pay_evidence),
      payMinCents: cents(raw.compensation_min_cents),
      payMaxCents: cents(raw.compensation_max_cents),
      coverPhotoUrl: text(raw.cover_photo_url),
      locationDisplay: text(raw.location_display),
      beginsAt: text(raw.begins_at),
      endsAt: text(raw.ends_at),
      expiresAt: text(raw.expires_at),
    };
    const id = String(raw.id);
    signals.set(id, {
      listingId: id,
      title: typeof raw.title === "string" ? raw.title : "Untitled listing",
      status: input.status,
      category: typeof raw.category === "string" ? raw.category : "mix",
      coverPhotoUrl: input.coverPhotoUrl ?? null,
      locationDisplay: input.locationDisplay ?? null,
      beginsAt: input.beginsAt ?? null,
      endsAt: input.endsAt ?? null,
      publishedAt: text(raw.published_at),
      expiresAt: input.expiresAt ?? null,
      readiness: listingReadiness(input, nowMs),
    });
  }
  return signals;
}
