import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import {
  getHostInvites,
  getHostListings,
  getInviteEntitlement,
  getMatchedSeekersForListing,
} from "@explore-and-earn/db";
import type { HostInvite, ListingRow } from "@explore-and-earn/db/client";
import { Icon, MetricCard, MetricGrid } from "@explore-and-earn/ui";

import { HostSectionHeading } from "../../../../../components/host";
import {
  MatchedSeekerSourcing,
  type InviteEntitlementVM,
  type SourcingBucketVM,
} from "../../../../../components/host/MatchedSeekerSourcing";
import type { OutreachSearchPreviewVM } from "../../../../../components/host/SeekerSearchDrawer";
import { isDevBenchEnabled } from "../../../../../lib/devBench";
import { devHostOutreachFixture } from "../../../../../lib/devBench/outreachFixtures";
import { readDevRole } from "../../../../../lib/devBench/server";
import { isSourceableOutreachListing } from "../../../../../lib/hostOutreach";
import { InvitesList, type InviteListingVM } from "./InvitesList";
import styles from "./page.module.css";

/** How many matched seekers to source per listing bucket. */
const SEEKERS_PER_LISTING = 12;

/**
 * NAMING (D17): the SECTION is "Outreach" — the host's outbound recruiting
 * surface, which is more than a list of invites. "Invite" stays the word for
 * the unit and its state (an invite is sent, delivered, applied), and for the
 * metered credit that pays for one. Renaming the noun as well would have made
 * the allowance copy, the add-on, and the DB all read wrong.
 *
 * WHAT LEFT THIS PAGE, AND WHY (spec §8).
 *
 * A "Campaign builder" panel used to sit at the top: four `<select>`s and a
 * `<textarea>` with a `defaultValue`, no form action, no state, no submit. Its
 * own footnote admitted "nothing here sends on its own." It was a form that
 * could not be filled in, above a product that charges for outreach.
 *
 * It is gone rather than wired, because there is nothing to wire it to. There
 * is NO campaign object anywhere: no campaigns table, no campaign_id on
 * `invites`, no campaign name — the only "campaign" in the schema is
 * `listing_boost_campaigns`, which is paid advertising and unrelated. Building
 * the panel for real would mean inventing a table, a write path, and a sending
 * mechanism, none of which belongs in a workspace-layout change.
 *
 * So this page presents what IS real: the invite ledger, per-listing invite
 * funnels grouped from actual `invites` rows, ranked matched seekers, and the
 * metered single-invite send. The word "campaign" does not appear on it,
 * because a grouping computed in this file at render time is not an object a
 * host created and can return to.
 */
export const metadata: Metadata = { title: "Outreach" };

// Per-host, never statically cached.
export const dynamic = "force-dynamic";

/** Live rows awaiting a seeker decision. */
const PENDING_STATUSES = new Set(["created", "delivered", "viewed"]);

/**
 * One listing's invite funnel, grouped in memory from real `invites` rows.
 * Deliberately NOT called a campaign — nothing was created, named, or stored;
 * this is a view over rows the host already sent one at a time.
 */
interface ListingOutreach {
  readonly listingId: string;
  readonly listingTitle: string;
  readonly sent: number;
  readonly delivered: number;
  readonly applied: number;
  readonly pending: number;
  readonly declined: number;
  readonly expired: number;
  readonly withdrawn: number;
  readonly latestAt: string;
}

function groupByListing(invites: readonly HostInvite[]): ListingOutreach[] {
  const byListing = new Map<string, ListingOutreach>();
  for (const invite of invites) {
    const key = invite.listingId;
    const existing = byListing.get(key);
    const delivered = invite.deliveredAt ? 1 : 0;
    const applied = invite.status === "applied" ? 1 : 0;
    const pending = PENDING_STATUSES.has(invite.status) ? 1 : 0;
    const declined = invite.status === "ignored" ? 1 : 0;
    const expired = invite.status === "expired" ? 1 : 0;
    const withdrawn = invite.status === "withdrawn" ? 1 : 0;
    if (existing) {
      byListing.set(key, {
        ...existing,
        sent: existing.sent + 1,
        delivered: existing.delivered + delivered,
        applied: existing.applied + applied,
        pending: existing.pending + pending,
        declined: existing.declined + declined,
        expired: existing.expired + expired,
        withdrawn: existing.withdrawn + withdrawn,
        latestAt:
          invite.createdAt > existing.latestAt ? invite.createdAt : existing.latestAt,
      });
    } else {
      byListing.set(key, {
        listingId: key,
        listingTitle: invite.listingTitle || "Untitled listing",
        sent: 1,
        delivered,
        applied,
        pending,
        declined,
        expired,
        withdrawn,
        latestAt: invite.createdAt,
      });
    }
  }
  return [...byListing.values()].sort((a, b) => b.latestAt.localeCompare(a.latestAt));
}

/** Tone + label for a listing's outreach pill, driven by its real funnel. */
function outreachTone(entry: ListingOutreach): { tone: string; label: string } {
  if (entry.applied > 0) return { tone: "hot", label: "Converting" };
  if (entry.declined > 0) return { tone: "live", label: "Responded" };
  if (entry.pending > 0) return { tone: "live", label: "Awaiting" };
  if (entry.expired > 0) return { tone: "draft", label: "Expired" };
  return { tone: "draft", label: "Withdrawn" };
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

export default async function HostOutreachPage() {
  let invites: readonly HostInvite[];
  let inviteListings: readonly InviteListingVM[];
  let entitlement: InviteEntitlementVM | null;
  let sourcingBuckets: readonly SourcingBucketVM[];
  let searchPreview: OutreachSearchPreviewVM | undefined;
  let hasAnyListings = false;
  let isDevFixture = false;

  // The exact-role local fixture must short-circuit before Clerk or database
  // access. Any other dev role sees no host discovery data at all.
  const devRole = isDevBenchEnabled() ? await readDevRole() : null;
  if (devRole === "host") {
    const fixture = devHostOutreachFixture();
    invites = fixture.invites;
    inviteListings = fixture.listings;
    entitlement = fixture.entitlement;
    sourcingBuckets = fixture.buckets;
    searchPreview = fixture.searchPreview;
    hasAnyListings = fixture.listings.length > 0;
    isDevFixture = true;
  } else if (devRole !== null) {
    return (
      <section className={styles.block}>
        <HostSectionHeading
          level={1}
          title="Outreach"
          description="Sign in as a host to send and track your invites."
        />
      </section>
    );
  } else {
    const { userId, getToken } = await auth();
    const token = userId ? await getToken() : null;
    if (!userId || !token) {
      return (
        <section className={styles.block}>
          <HostSectionHeading
            level={1}
            title="Outreach"
            description="Sign in as a host to send and track your invites."
          />
        </section>
      );
    }

    // Listing and invite faults reach the route error boundary. They must never
    // impersonate an honest empty ledger or an account with no listings.
    const [loadedInvites, listings, loadedEntitlement] = await Promise.all([
      getHostInvites(token, userId),
      getHostListings(token, userId),
      getInviteEntitlement(token, userId),
    ]);
    invites = loadedInvites;
    entitlement = loadedEntitlement;
    hasAnyListings = listings.length > 0;

    const nowMs = Date.now();
    const sourceableListings = listings.filter((listing: ListingRow) =>
      isSourceableOutreachListing(listing, nowMs),
    );
    inviteListings = sourceableListings.map((listing) => ({
      id: listing.id,
      title: listing.title || "Untitled listing",
    }));

    const bucketResults = await Promise.all(
      sourceableListings.map(async (listing) => ({
        listing,
        result: await getMatchedSeekersForListing(
          token,
          userId,
          listing.id,
          SEEKERS_PER_LISTING,
        ),
      })),
    );
    sourcingBuckets = bucketResults.map(({ listing, result }) =>
      result.ok
        ? {
            listingId: listing.id,
            listingTitle: listing.title || "Untitled listing",
            category: listing.category,
            locationDisplay: listing.location_display,
            state: "ready" as const,
            seekers: result.seekers.map((seeker) => ({
              ...seeker,
              // Do not ask a host browser to fetch seeker-supplied photo URLs
              // until profile media has a trusted storage/URL policy.
              photoUrl: null,
            })),
          }
        : {
            listingId: listing.id,
            listingTitle: listing.title || "Untitled listing",
            category: listing.category,
            locationDisplay: listing.location_display,
            state: "unavailable" as const,
          },
    );
  }

  // --- Real metrics derived from the invite rows -------------------------
  const sent = invites.length;
  const delivered = invites.filter((i) => i.deliveredAt !== null).length;
  const applied = invites.filter((i) => i.status === "applied").length;
  const byListing = groupByListing(invites);

  // Compact starting state: nothing sent, nothing to send to.
  if (sent === 0 && inviteListings.length === 0) {
    return (
      <section
        className={styles.block}
        data-dev-fixture={isDevFixture ? "host-outreach" : undefined}
      >
        <HostSectionHeading
          level={1}
          eyebrow="Outbound recruiting"
          title="Outreach"
          description="Invite the seekers who fit your listings, and track every invite from sent to applied."
        />
        <div className={styles.firstRun}>
          <h2 className={styles.firstRunTitle}>
            {hasAnyListings
              ? "No current listings are ready for outreach"
              : "Nothing to reach out about yet"}
          </h2>
          <p className={styles.firstRunLede}>
            {hasAnyListings
              ? "Outreach requires a live, verified listing with a future closing date. Review your listings to publish, verify, or extend one."
              : "Outreach works from a listing: publish one and we rank the seekers whose profile, timeline, and needs actually fit it. Each invite draws one credit from your available invite balance."}
          </p>
          <div className={styles.firstRunActions}>
            <Link
              className={styles.firstRunCta}
              href={hasAnyListings ? "/host/listings" : "/host/listings/new"}
            >
              <Icon name="status.open" size={16} aria-hidden />
              {hasAnyListings ? "Review listings" : "Create a listing"}
            </Link>
            <Link className={styles.firstRunGhost} href="/for-hosts/demo/outreach">
              <Icon name="action.view" size={16} aria-hidden />
              See outreach in a full season
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className={styles.block}
      data-dev-fixture={isDevFixture ? "host-outreach" : undefined}
    >
      <HostSectionHeading
        level={1}
        eyebrow="Outbound recruiting"
        title="Outreach"
        description="Ranked seekers for each of your listings, the invites you have sent, and what came back."
      />

      <MetricGrid>
        <MetricCard
          label="Invites sent"
          value={sent.toLocaleString()}
          trend={sent > 0 ? "All time" : "None yet"}
          trendTone="neutral"
        />
        <MetricCard
          label="Delivered"
          value={`${pct(delivered, sent)}%`}
          trend={sent > 0 ? `${delivered} of ${sent}` : "—"}
          trendTone={pct(delivered, sent) >= 40 ? "up" : "neutral"}
        />
        <MetricCard
          label="Turned into applications"
          value={`${pct(applied, sent)}%`}
          trend={sent > 0 ? `${applied} of ${sent}` : "—"}
          trendTone={pct(applied, sent) >= 15 ? "up" : "neutral"}
        />
      </MetricGrid>

      {/* --- Matched seekers: per-listing buckets + the metered invite ----- */}
      <div className={styles.section}>
        <div className={styles.sectionText}>
          <h2
            id="host-outreach-matches-heading"
            className={styles.sectionTitle}
          >
            Seekers who fit your listings
          </h2>
          <p className={styles.sectionLede}>
            Ranked by their real aggregate match score. A discovery aid, never
            a gate — anyone can still apply. Every
            send uses the monthly allowance first, then purchased invite credits.
          </p>
          <p className={styles.sectionLede}>
            Opted-in seekers share their display name, bio, general skills,
            preferred categories, and match score here. Structured account
            contact fields, exact availability, pay preferences, and résumés
            stay private until the product&apos;s application or conversation gates
            allow access.
          </p>
        </div>
      </div>
      <MatchedSeekerSourcing
        buckets={sourcingBuckets}
        entitlement={entitlement}
        preview={
          isDevFixture && searchPreview
            ? { notice: searchPreview.notice }
            : undefined
        }
      />

      {/* --- Response tracking, grouped by listing ------------------------ */}
      {byListing.length > 0 ? (
        <div className={styles.section}>
          <div className={styles.sectionText}>
            <h2 className={styles.sectionTitle}>What came back, by listing</h2>
            <p className={styles.sectionLede}>
              Every invite you have sent for each listing and how far it got.
              Grouped here for reading — invites are sent and tracked one at a
              time.
            </p>
          </div>
          <div className={styles.funnels}>
            {byListing.map((entry) => {
              const { tone, label } = outreachTone(entry);
              const reach = pct(entry.delivered, entry.sent);
              return (
                <article key={entry.listingId} className={styles.funnelCard}>
                  <div className={styles.funnelHead}>
                    <div className={styles.funnelTitles}>
                      <h3 className={styles.funnelTitle}>{entry.listingTitle}</h3>
                      <p className={styles.funnelStats}>
                        {entry.sent} sent · {entry.delivered} delivered · {entry.applied}{" "}
                        applied
                      </p>
                    </div>
                    <span className={styles.pill} data-tone={tone}>
                      {label}
                    </span>
                  </div>
                  <div
                    className={styles.track}
                    role="meter"
                    aria-valuenow={reach}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${entry.listingTitle} invite delivery`}
                  >
                    <span
                      className={styles.trackFill}
                      style={{ width: `${reach}%` }}
                    />
                  </div>
                  <div className={styles.funnelTags}>
                    <span className={styles.tag}>
                      <Icon name="action.view" size={16} aria-hidden />
                      {pct(entry.delivered, entry.sent)}% delivered
                    </span>
                    <span className={styles.tag}>
                      <Icon name="status.applied" size={16} aria-hidden />
                      {pct(entry.applied, entry.sent)}% applied
                    </span>
                    {entry.declined > 0 ? (
                      <span className={styles.tag}>{entry.declined} declined</span>
                    ) : null}
                    {entry.expired > 0 ? (
                      <span className={styles.tag}>{entry.expired} expired</span>
                    ) : null}
                    {entry.withdrawn > 0 ? (
                      <span className={styles.tag}>{entry.withdrawn} withdrawn</span>
                    ) : null}
                    {entry.pending > 0 ? (
                      <span className={styles.tag}>{entry.pending} awaiting response</span>
                    ) : null}
                    <Link
                      className={styles.funnelLink}
                      href={`/host/applicants?listingId=${entry.listingId}`}
                    >
                      See applicants
                      <Icon name="action.forward" size={14} aria-hidden />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* --- Sent invites + the real send/withdraw flow -------------------- */}
      <div className={styles.section}>
        <div className={styles.sectionText}>
          <h2 className={styles.sectionTitle}>Sent invites</h2>
          <p className={styles.sectionLede}>
            Seekers you have invited to apply — withdraw any that are still
			pending. A withdrawal completed before delivery processing starts
			reverses the original charge: monthly credit returns to that original
			month, while a purchased credit returns to the reusable balance.
          </p>
        </div>
      </div>
      <InvitesList
        invites={invites}
        listings={inviteListings}
        hasAnyListings={hasAnyListings}
        preview={searchPreview}
      />
    </section>
  );
}
