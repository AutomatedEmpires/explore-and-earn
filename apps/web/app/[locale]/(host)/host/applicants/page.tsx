import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import {
  analyticsScopeForTier,
  getConversations,
  getHostApplications,
  getHostListings,
  getHostSubscriptionTier,
  getLastMessagesForConversations,
  getMatchScoresForHost,
  getSeekerDisplayNames,
  rowToDiscoveryFields,
} from "@explore-and-earn/db";
import { Icon } from "@explore-and-earn/ui";

import {
  HostApplicantWorkspace,
  HostSectionHeading,
} from "../../../../../components/host";
import type { DiscoveryListing } from "../../../../../components/discovery";
import {
  toApplicantItem,
  threadsByApplicationId,
  type LastMessageSummary,
} from "./applicants-data";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Applicants" };

// Applicants are per-host (app-level scoped) and must never be statically cached.
export const dynamic = "force-dynamic";

/**
 * The first-applicant state (D23): teach what will happen, and offer the two
 * things that actually cause it — outreach, and a look at a full pipeline.
 */
function NoApplicantsYet({ hasListings }: { readonly hasListings: boolean }) {
  return (
    <div className={styles.firstRun}>
      <h2 className={styles.firstRunTitle}>No applications yet</h2>
      <p className={styles.firstRunLede}>
        {hasListings
          ? "Applications land at “New”. From there you move people through review, shortlist, and offer — every move is a button, and the database enforces which ones are legal."
          : "Nobody can apply until a listing is live. Publish one, or invite seekers directly."}
      </p>
      <div className={styles.firstRunActions}>
        {hasListings ? (
          <Link className={styles.firstRunCta} href="/host/outreach">
            <Icon name="action.share" size={16} aria-hidden />
            Invite seekers to apply
          </Link>
        ) : (
          <Link className={styles.firstRunCta} href="/host/listings/new">
            <Icon name="status.open" size={16} aria-hidden />
            Create a listing
          </Link>
        )}
        <Link className={styles.firstRunGhost} href="/for-hosts/demo/applicants">
          <Icon name="action.view" size={16} aria-hidden />
          See a full pipeline
        </Link>
      </div>
    </div>
  );
}

export default async function HostApplicantsPage({
  searchParams,
}: {
  searchParams: Promise<{ listingId?: string }>;
}) {
  const { listingId: filterListingId } = await searchParams;
  const { userId, getToken } = await auth();
  const token = userId ? await getToken() : null;

  // Unauthenticated (or no session token): graceful fallback. The (host) route
  // group is also middleware-protected, so this is belt-and-braces.
  if (!userId || !token) {
    return (
      <section className={styles.block}>
        <HostSectionHeading
          level={1}
          title="Applicants"
          description="Sign in as a host to review the people applying to your opportunities."
        />
        <NoApplicantsYet hasListings={false} />
      </section>
    );
  }

  const [applications, listingRows, conversations, matchScores, subscriptionTier] =
    await Promise.all([
      getHostApplications(token, userId),
      getHostListings(token, userId).catch(() => []),
      getConversations(token, userId, "host").catch(() => []),
      // Real ADR-040 fit for the host's applicants (populated on apply), now
      // carrying the per-component breakdown so the card can say WHY.
      getMatchScoresForHost(token).catch(() => new Map()),
      // Real subscription tier — gates the match reading (never fabricated).
      getHostSubscriptionTier(token, userId).catch(() => "none" as const),
    ]);
  const threadsMap = threadsByApplicationId(conversations);

  // Last message per thread, in ONE batched query. This is what turns "they
  // applied nine days ago" into "they wrote four days ago and are waiting".
  const lastMessages = await getLastMessagesForConversations(
    token,
    [...threadsMap.values()],
  ).catch(() => new Map<string, LastMessageSummary>());

  // Resolve seeker display names in a single batch query. A fault here does not
  // stop the pipeline rendering — the applications, listings and threads above
  // are the page — but it is logged and the cards say the names are unavailable
  // rather than showing the pseudonymous handle as if it were the answer.
  const displayNames = await getSeekerDisplayNames(
    token,
    [...new Set(applications.map((a) => a.seekerProfileId))],
  );
  if (displayNames.status === "unavailable") {
    console.error("[host/applicants] applicant name lookup failed:", displayNames.reason);
  }

  const listingsById = new Map<string, DiscoveryListing>(
    listingRows.map((row): [string, DiscoveryListing] => [
      row.id,
      rowToDiscoveryFields(row),
    ]),
  );
  // Defense-in-depth: only show applications for listings we can confirm belong
  // to this host (present in listingsById). Guards against any ownership filter
  // ambiguity in the DB layer.
  const hostListingIds = new Set(listingRows.map((row) => row.id));
  const ownedApplications = applications.filter((application) =>
    hostListingIds.has(application.listingId),
  );

  // Optional listingId query param — a deep link from a listing card. The
  // in-page listing filter covers the same ground once you are here.
  const filteredApplications = filterListingId
    ? ownedApplications.filter(
        (application) => application.listingId === filterListingId,
      )
    : ownedApplications;

  const applicants = filteredApplications.map((application) =>
    toApplicantItem(
      application,
      listingsById,
      displayNames,
      threadsMap,
      matchScores,
      lastMessages,
    ),
  );

  const filterListing = filterListingId ? listingsById.get(filterListingId) : undefined;
  const filterTitle = filterListing?.title ?? filterListingId;

  // ADR-039: the match READING is a paid capability, resolved through the SAME
  // function the analytics surface gates on so the two can never disagree about
  // what a tier includes.
  const showMatch = analyticsScopeForTier(subscriptionTier) === "full";

  const listingOptions = listingRows.map((row) => ({
    id: row.id,
    title: row.title || "Untitled listing",
  }));

  return (
    <section className={styles.block}>
      <HostSectionHeading
        level={1}
        eyebrow="Recruiting"
        title={filterListingId ? `Applicants — ${filterTitle}` : "Applicants"}
        description="Everyone who has applied, and where they are. Move people with the buttons on each card — the database enforces which moves are legal."
        {...(filterListingId
          ? { actionLabel: "All applicants", actionHref: "/host/applicants" }
          : {})}
      />

      {applicants.length > 0 ? (
        <HostApplicantWorkspace
          applicants={applicants}
          listings={listingOptions}
          showMatch={showMatch}
        />
      ) : (
        <NoApplicantsYet hasListings={listingRows.length > 0} />
      )}
    </section>
  );
}
