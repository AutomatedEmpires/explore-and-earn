import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  authedClient,
  getApplicationCountsByListing,
  getNewApplicationCountsByListing,
  getHostListings,
  getHostListingSignals,
  getHostProfile,
  rowToDiscoveryFields,
  type HostListingSignal,
  type ListingRow,
} from "@explore-and-earn/db";
import { Icon } from "@explore-and-earn/ui";

import {
  HostListingsManager,
  HostSectionHeading,
  dbStatusToHostState,
  type HostListingItem,
} from "../../../../../components/host";
import { EmptyState } from "../../../../../components/discovery";
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
    // Applicant counts and health signals are merged below; default to the
    // honest "nothing loaded" values until then.
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
        level={1}
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

/**
 * The first-listing state (spec §6, D23).
 *
 * Three doors, and every one of them goes somewhere real. There is deliberately
 * no "start from a template": no template mechanism exists in the schema or the
 * query layer, and a fourth button that opened a form with nothing in it would
 * be the kind of promise this redesign is repaying. What DOES exist is
 * `duplicateListing`, which needs a first listing to copy — so it appears on a
 * listing's own page, not here.
 */
function FirstListing() {
  const doors = [
    {
      href: "/host/listings/new",
      icon: "action.edit" as const,
      title: "Write it from scratch",
      body: "Role, place, dates, and the three answers seekers need most: housing, meals, pay.",
      primary: true,
    },
    {
      href: "/for-hosts/demo/job",
      icon: "action.view" as const,
      title: "Look at a finished one first",
      body: "The demo workspace's flagship role, written out in full. Sample data, clearly labelled.",
      primary: false,
    },
    {
      href: "/host/onboarding",
      icon: "action.forward" as const,
      title: "Pick up where you left off",
      body: "Return to setup if you started your workspace and stopped partway.",
      primary: false,
    },
  ];

  return (
    <div className={styles.firstRun}>
      <h2 className={styles.firstRunTitle}>Nothing posted yet</h2>
      <p className={styles.firstRunLede}>
        A listing is how seekers find you. Drafts are free and private — you only
        need a plan when you publish.
      </p>
      <ul className={styles.doors}>
        {doors.map((door) => (
          <li key={door.href}>
            <Link
              className={styles.door}
              href={door.href}
              data-primary={door.primary ? "true" : undefined}
            >
              <span className={styles.doorIcon} aria-hidden>
                <Icon name={door.icon} size={20} />
              </span>
              <span className={styles.doorText}>
                <span className={styles.doorTitle}>{door.title}</span>
                <span className={styles.doorBody}>{door.body}</span>
              </span>
              <Icon name="action.forward" size={18} aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function HostListingsPage() {
  const { userId, getToken } = await auth();
  if (!userId) return <SignInToManage />;
  const token = await getToken();
  if (!token) return <SignInToManage />;

  // Listings, applicant counts and health signals are independent; a counts or
  // signals failure must not break the inventory view, so each degrades alone.
  const [items, counts, newCounts, signals] = await Promise.all([
    loadHostItems(token, userId),
    getApplicationCountsByListing(token, userId).catch(
      () => ({}) as Record<string, number>,
    ),
    getNewApplicationCountsByListing(token, userId).catch(
      () => ({}) as Record<string, number>,
    ),
    getHostListingSignals(token, userId).catch(
      () => new Map<string, HostListingSignal>(),
    ),
  ]);

  const withCounts: HostListingItem[] = items.map((item) => {
    const signal = signals.get(item.listing.id);
    return {
      ...item,
      applicantCount: counts[item.listing.id] ?? 0,
      newApplicantCount: newCounts[item.listing.id] ?? 0,
      ...(signal ? { readiness: signal.readiness, deadlineAt: signal.expiresAt } : {}),
    };
  });

  return (
    <section className={styles.block}>
      <HostSectionHeading
        level={1}
        eyebrow="Your inventory"
        title="Listings"
        description="Every opportunity you have posted, with live applicant counts and what each one still needs."
        actionLabel="New listing"
        actionHref="/host/listings/new"
      />

      {withCounts.length > 0 ? (
        <HostListingsManager listings={withCounts} />
      ) : (
        <FirstListing />
      )}
    </section>
  );
}
