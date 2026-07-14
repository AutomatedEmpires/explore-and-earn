import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import {
  getConversations,
  getHostApplications,
  getHostListings,
  getHostSubscriptionTier,
  getMatchScoresForHost,
  getSeekerDisplayNames,
  rowToDiscoveryFields,
} from "@explore-and-earn/db";
import { PLAN_ENTITLEMENTS } from "@explore-and-earn/contracts";
import { Icon, MetricCard, MetricGrid } from "@explore-and-earn/ui";

import {
  APPLICANT_STAGE_LABEL,
  HostApplicantCard,
  HostPipelineBoard,
  HostSectionHeading,
  countByStage,
} from "../../../../components/host";
import { EmptyState, type DiscoveryListing } from "../../../../components/discovery";
import { toApplicantItem, threadsByApplicationId } from "./applicants-data";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Applicants" };

// Applicants are per-host (app-level scoped) and must never be statically cached.
export const dynamic = "force-dynamic";

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
          title="Applicants"
          description="Sign in as a host to review the people applying to your opportunities."
        />
        <EmptyState
          title="Sign in to review applicants"
          message="You need to be signed in as a host to see who has applied to your listings."
          actionLabel="Invite seekers"
          actionHref="/host/invites"
        />
      </section>
    );
  }

  // Applications carry only listingId/listingTitle; load the host's listings to
  // resolve each application's full DiscoveryListing for the canonical card.
  const [applications, listingRows, conversations, matchScores, subscriptionTier] =
    await Promise.all([
      getHostApplications(token, userId),
      getHostListings(token, userId).catch(() => []),
      getConversations(token, userId, "host").catch(() => []),
      // Real ADR-040 fit for the host's applicants (populated on apply). Resilient:
      // an empty map when no scores exist yet, so the bucket shows its empty state.
      getMatchScoresForHost(token).catch(() => new Map()),
      // Real subscription tier — gates the Matched-seekers bucket (never fabricated).
      getHostSubscriptionTier(token, userId).catch(() => "none" as const),
    ]);
  const threadsMap = threadsByApplicationId(conversations);

  // Resolve seeker display names in a single batch query.
  const displayNames = await getSeekerDisplayNames(
    token,
    [...new Set(applications.map((a) => a.seekerProfileId))],
  );

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

  // Optional listingId query param — filter to a single listing.
  const filteredApplications = filterListingId
    ? ownedApplications.filter(
        (application) => application.listingId === filterListingId,
      )
    : ownedApplications;

  const applicants = filteredApplications.map((application) =>
    toApplicantItem(application, listingsById, displayNames, threadsMap, matchScores),
  );

  const filterListing = filterListingId
    ? listingsById.get(filterListingId)
    : undefined;
  const filterTitle = filterListing?.title ?? filterListingId;

  // Command row figures — derived from the SAME applicants array rendered in the
  // board, so the metric strip can never drift from the pipeline below it.
  const counts = countByStage(applicants);
  const total = applicants.length;

  // "Matched seekers" bucket — REAL ADR-040 fit only. Applicants that carry a
  // genuine match score (populated on apply; see getMatchScoresForHost), ranked
  // highest-first. A discovery aid, never a gate: unscored or already-declined
  // seekers are simply not prioritised here — never locked out of applying. No
  // fabricated seekers, scores, or counts.
  const matchedSeekers = applicants
    .filter((a) => a.matchScore != null && a.stage !== "declined")
    .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0))
    .slice(0, 6);

  // Tier gate (ADR-039): the matched-seeker bucket is a paid capability. The
  // 'full' analytics entitlement (Professional / Enterprise) unlocks it; Starter
  // and un-subscribed hosts get the 'basic' tier and a compact upsell instead.
  // Derived from the host's REAL subscription via the same PLAN_ENTITLEMENTS the
  // analytics surface gates on — never fabricated.
  const matchedSeekersUnlocked =
    subscriptionTier !== "none" &&
    PLAN_ENTITLEMENTS[subscriptionTier].analytics === "full";

  return (
    <section className={styles.block}>
      <HostSectionHeading
        title={filterListingId ? `Applicants — ${filterTitle}` : "Applicants"}
        description={
          filterListingId
            ? "Applicants for this listing, grouped by stage."
            : "Your applicant pipeline across all listings, grouped by stage."
        }
        {...(filterListingId
          ? { actionLabel: "All applicants", actionHref: "/host/applicants" }
          : {})}
      />

      {applicants.length > 0 ? (
        <>
          <MetricGrid>
            <MetricCard
              label={APPLICANT_STAGE_LABEL.new}
              value={counts.new}
              trend="Review"
              trendTone="neutral"
            />
            <MetricCard
              label={APPLICANT_STAGE_LABEL.reviewing}
              value={counts.reviewing}
              trend="In flight"
              trendTone="neutral"
            />
            <MetricCard
              label={APPLICANT_STAGE_LABEL.offered}
              value={counts.offered}
              trend={counts.offered > 0 ? "Open" : "—"}
              trendTone={counts.offered > 0 ? "up" : "down"}
            />
            <MetricCard
              label="In pipeline"
              value={total}
              trend="Active"
              trendTone="up"
            />
          </MetricGrid>

          <section
            className={styles.bucket}
            aria-labelledby="matched-seekers-heading"
          >
            <header className={styles.bucketHead}>
              <div>
                <span className={styles.bucketKicker}>Matched seekers</span>
                <h2 id="matched-seekers-heading" className={styles.bucketTitle}>
                  Seekers who fit your listings
                </h2>
                <p className={styles.bucketSub}>
                  Ranked by real match on résumé, availability, and experience —
                  a discovery aid, never a gate. Anyone can still apply.
                </p>
              </div>
              {matchedSeekersUnlocked && matchedSeekers.length > 0 ? (
                <Link className={styles.bucketAction} href="/host/invites">
                  Invite seekers
                  <Icon name="action.forward" size={16} aria-hidden />
                </Link>
              ) : null}
            </header>

            {!matchedSeekersUnlocked ? (
              <div className={styles.locked}>
                <span className={styles.lockedIcon} aria-hidden>
                  <Icon name="system.lock" size={20} />
                </span>
                <div className={styles.lockedText}>
                  <p className={styles.lockedTitle}>
                    Matched seekers is a Professional feature
                  </p>
                  <p className={styles.lockedSub}>
                    Upgrade to Professional to see the seekers who best fit your
                    open listings, ranked by their real match score.
                  </p>
                </div>
                <Link className={styles.lockedCta} href="/host/billing">
                  View plans
                  <Icon name="action.forward" size={16} aria-hidden />
                </Link>
              </div>
            ) : matchedSeekers.length > 0 ? (
              <ul className={styles.bucketGrid}>
                {matchedSeekers.map((item) => (
                  <li key={item.id} className={styles.bucketItem}>
                    <HostApplicantCard applicant={item} showMatch />
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.bucketEmpty}>
                <span className={styles.bucketEmptyIcon} aria-hidden>
                  <Icon name="status.match" size={20} />
                </span>
                <p className={styles.bucketEmptyTitle}>No matched seekers yet</p>
                <p className={styles.bucketEmptySub}>
                  As seekers apply to your listings, the strongest fits surface
                  here, ranked by their real match score.
                </p>
              </div>
            )}
          </section>

          <HostPipelineBoard applicants={applicants} />
        </>
      ) : (
        <EmptyState
          illustration="empty.hostApplicants"
          title="No applicants yet"
          message={
            filterListingId
              ? "No applicants for this listing yet."
              : "When seekers apply to your listings, their applications will appear here, grouped by stage for review."
          }
          actionLabel="Invite seekers"
          actionHref="/host/invites"
        />
      )}
    </section>
  );
}
