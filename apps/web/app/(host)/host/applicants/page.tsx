import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import {
  getConversations,
  getHostApplications,
  getHostListings,
  getMatchScoresForHost,
  getSeekerDisplayNames,
  rowToDiscoveryFields,
} from "@explore-and-earn/db";
import { Icon, Meter, MetricCard, MetricGrid } from "@explore-and-earn/ui";

import {
  APPLICANT_STAGE_LABEL,
  HostPipelineBoard,
  HostSectionHeading,
  countByStage,
  type HostApplicantItem,
} from "../../../../components/host";
import { EmptyState, type DiscoveryListing } from "../../../../components/discovery";
import { toApplicantItem, threadsByApplicationId } from "./applicants-data";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Applicants" };

// Applicants are per-host (app-level scoped) and must never be statically cached.
export const dynamic = "force-dynamic";

/** Two-letter initials for the rail avatar (no avatar URL in the view-model). */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

/**
 * Deterministic, presentation-only sparkline shape for a stage tile. This is
 * NOT analytics or a trend computation — it derives a stable bar profile from
 * the real per-stage count so the data viz reflects the actual pipeline shape
 * (a fuller stage reads taller) without ever fabricating history. Pure.
 */
function stageSpark(count: number, total: number): readonly number[] {
  const peak = total === 0 ? 18 : Math.max(18, Math.round((count / total) * 100));
  const base = Math.max(10, Math.round(peak * 0.34));
  // A gentle rising ramp toward the stage's share of the pipeline.
  return [0.32, 0.5, 0.42, 0.64, 0.58, 0.82, 1].map((f) =>
    Math.max(8, Math.round(base + (peak - base) * f)),
  );
}

/**
 * Presentation-only "profile signal" for the recommended-seekers rail. This is
 * deliberately NOT a matching/scoring algorithm (match isolation is founder-
 * gated and guardrail-enforced): it reads how complete the HOUSING/MEALS/PAY
 * triad is on the listing the seeker applied to — i.e. how warm/actionable the
 * lead is for the host — and nothing about the seeker's fit. Pure + stable.
 */
function leadSignal(item: HostApplicantItem): number {
  const b = item.listing.benefits;
  const provided = [b.housing, b.meals, b.pay].filter(
    (slot) => slot.provision === "provided",
  ).length;
  const hasNote = item.note ? 1 : 0;
  // 3 triad slots + a cover-note bump, mapped onto a confident 70..96 band so
  // the meter always reads as a strong, invite-worthy lead.
  return 70 + provided * 8 + hasNote * 2;
}

/** Presentation labels for the ADR-040 match bands (render-time only). */
const BAND_LABEL: Record<string, string> = {
  strong: "Strong match",
  developing: "Developing match",
  needs_attention: "Needs attention",
};

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
  const [applications, listingRows, conversations, matchScores] = await Promise.all([
    getHostApplications(token, userId),
    getHostListings(token, userId).catch(() => []),
    getConversations(token, userId, "host").catch(() => []),
    // Real ADR-040 fit for the host's applicants (populated on apply). Resilient:
    // an empty map when no scores exist yet, so the rail degrades to lead signal.
    getMatchScoresForHost(token).catch(() => new Map()),
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

  // Best-fit early applicants for the "Recommended seekers" rail — ranked by the
  // real ADR-040 match score when it has been computed (populated on apply), and
  // gracefully falling back to the triad lead-signal for applicants not yet scored.
  const rankSignal = (a: HostApplicantItem): number => a.matchScore ?? leadSignal(a);
  const recommended = applicants
    .filter((a) => a.stage === "new" || a.stage === "reviewing")
    .sort((a, b) => rankSignal(b) - rankSignal(a))
    .slice(0, 3);

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
              spark={stageSpark(counts.new, total)}
            />
            <MetricCard
              label={APPLICANT_STAGE_LABEL.reviewing}
              value={counts.reviewing}
              trend="In flight"
              trendTone="neutral"
              spark={stageSpark(counts.reviewing, total)}
            />
            <MetricCard
              label={APPLICANT_STAGE_LABEL.offered}
              value={counts.offered}
              trend={counts.offered > 0 ? "Open" : "—"}
              trendTone={counts.offered > 0 ? "up" : "down"}
              spark={stageSpark(counts.offered, total)}
            />
            <MetricCard
              label="In pipeline"
              value={total}
              trend="Active"
              trendTone="up"
              spark={stageSpark(total, total)}
            />
          </MetricGrid>

          <HostPipelineBoard applicants={applicants} />

          {recommended.length > 0 ? (
            <div className={styles.rail}>
              <header className={styles.railHead}>
                <div>
                  <span className={styles.railKicker}>Recommended seekers</span>
                  <h2 className={styles.railTitle}>Keep the role warm</h2>
                  <p className={styles.railSub}>
                    Strong early applicants worth a personal invite before the
                    pool goes cold.
                  </p>
                </div>
                <Link className={styles.railAction} href="/host/invites">
                  Invite seekers
                  <Icon name="action.forward" size={16} aria-hidden />
                </Link>
              </header>
              <ul className={styles.railGrid}>
                {recommended.map((item) => {
                  // Real match when scored (populated on apply); else the triad lead signal.
                  const signal = item.matchScore ?? leadSignal(item);
                  const meterLabel = item.matchBand ? BAND_LABEL[item.matchBand] : "Lead signal";
                  const href = item.threadId
                    ? `/host/messages/${item.threadId}`
                    : `/host/applicants/${item.id}`;
                  return (
                    <li key={item.id} className={styles.matchCard}>
                      <div className={styles.matchWho}>
                        <span className={styles.matchAvatar} aria-hidden>
                          {initials(item.applicantName)}
                        </span>
                        <div className={styles.matchText}>
                          <span className={styles.matchName}>
                            {item.applicantName}
                          </span>
                          <span className={styles.matchRole}>
                            {item.listing.title}
                          </span>
                        </div>
                      </div>
                      <div className={styles.matchMeter}>
                        <Meter value={signal} label={meterLabel} />
                      </div>
                      <div
                        className={styles.matchTrack}
                        aria-hidden
                        style={{ "--w": `${signal}%` } as CSSProperties}
                      >
                        <span />
                      </div>
                      <Link className={styles.matchInvite} href={href}>
                        <Icon name="action.message" size={16} aria-hidden />
                        Invite to chat
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
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
