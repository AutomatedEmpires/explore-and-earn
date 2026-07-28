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
  type SourcingBucketVM,
} from "../../../../../components/host/MatchedSeekerSourcing";
import { InvitesList } from "./InvitesList";
import styles from "./page.module.css";

/** How many matched seekers to source per listing bucket. */
const SEEKERS_PER_LISTING = 12;

/**
 * NAMING (D17): the SECTION is "Outreach" — the host's outbound recruiting
 * surface, which is more than a list of invites. "Invite" stays the word for
 * the unit and its state (an invite is sent, opened, applied), and for the
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

/** Statuses that mean the seeker opened/engaged the invite. */
const OPENED_STATUSES = new Set(["viewed", "applied"]);
/** Terminal-negative statuses — count as sent but not "in flight". */
const COLD_STATUSES = new Set(["ignored", "expired", "withdrawn"]);

/**
 * One listing's invite funnel, grouped in memory from real `invites` rows.
 * Deliberately NOT called a campaign — nothing was created, named, or stored;
 * this is a view over rows the host already sent one at a time.
 */
interface ListingOutreach {
  readonly listingId: string;
  readonly listingTitle: string;
  readonly sent: number;
  readonly opened: number;
  readonly applied: number;
  readonly cold: number;
  readonly latestAt: string;
}

function groupByListing(invites: readonly HostInvite[]): ListingOutreach[] {
  const byListing = new Map<string, ListingOutreach>();
  for (const invite of invites) {
    const key = invite.listingId;
    const existing = byListing.get(key);
    const opened = OPENED_STATUSES.has(invite.status) ? 1 : 0;
    const applied = invite.status === "applied" ? 1 : 0;
    const cold = COLD_STATUSES.has(invite.status) ? 1 : 0;
    if (existing) {
      byListing.set(key, {
        ...existing,
        sent: existing.sent + 1,
        opened: existing.opened + opened,
        applied: existing.applied + applied,
        cold: existing.cold + cold,
        latestAt:
          invite.createdAt > existing.latestAt ? invite.createdAt : existing.latestAt,
      });
    } else {
      byListing.set(key, {
        listingId: key,
        listingTitle: invite.listingTitle || "Untitled listing",
        sent: 1,
        opened,
        applied,
        cold,
        latestAt: invite.createdAt,
      });
    }
  }
  return [...byListing.values()].sort((a, b) => b.latestAt.localeCompare(a.latestAt));
}

/** Tone + label for a listing's outreach pill, driven by its real funnel. */
function outreachTone(entry: ListingOutreach): { tone: string; label: string } {
  if (entry.applied > 0) return { tone: "hot", label: "Converting" };
  if (entry.opened > 0) return { tone: "live", label: "Opened" };
  if (entry.sent > entry.cold) return { tone: "live", label: "Awaiting" };
  return { tone: "draft", label: "No response" };
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

export default async function HostOutreachPage() {
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

  const [invites, listings, entitlement] = await Promise.all([
    getHostInvites(token, userId).catch(() => [] as HostInvite[]),
    getHostListings(token, userId).catch(() => [] as ListingRow[]),
    getInviteEntitlement(token, userId).catch(() => null),
  ]);

  // Per-listing matched-seeker buckets (ownership + discovery-safe projection
  // enforced inside getMatchedSeekersForListing). A degraded/empty bucket never
  // fails the page — the surface renders its honest empty state instead.
  const bucketResults = await Promise.all(
    listings.map(async (listing) => {
      const result = await getMatchedSeekersForListing(
        token,
        userId,
        listing.id,
        SEEKERS_PER_LISTING,
      ).catch(() => null);
      return { listing, seekers: result?.seekers ?? [] };
    }),
  );
  const sourcingBuckets: SourcingBucketVM[] = bucketResults.map(
    ({ listing, seekers }) => ({
      listingId: listing.id,
      listingTitle: listing.title || "Untitled listing",
      category: listing.category,
      locationDisplay: listing.location_display,
      seekers,
    }),
  );

  // --- Real metrics derived from the invite rows -------------------------
  const sent = invites.length;
  const opened = invites.filter((i) => OPENED_STATUSES.has(i.status)).length;
  const applied = invites.filter((i) => i.status === "applied").length;
  const byListing = groupByListing(invites);

  // Compact starting state: nothing sent, nothing to send to.
  if (sent === 0 && listings.length === 0) {
    return (
      <section className={styles.block}>
        <HostSectionHeading
          level={1}
          eyebrow="Outbound recruiting"
          title="Outreach"
          description="Invite the seekers who fit your listings, and track every invite from sent to applied."
        />
        <div className={styles.firstRun}>
          <h2 className={styles.firstRunTitle}>Nothing to reach out about yet</h2>
          <p className={styles.firstRunLede}>
            Outreach works from a listing: publish one and we rank the seekers
            whose profile, timeline, and needs actually fit it. Each invite draws
            one credit from your monthly allowance.
          </p>
          <div className={styles.firstRunActions}>
            <Link className={styles.firstRunCta} href="/host/listings/new">
              <Icon name="status.open" size={16} aria-hidden />
              Create a listing
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
    <section className={styles.block}>
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
          label="Opened"
          value={`${pct(opened, sent)}%`}
          trend={sent > 0 ? `${opened} of ${sent}` : "—"}
          trendTone={pct(opened, sent) >= 40 ? "up" : "neutral"}
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
          <h2 className={styles.sectionTitle}>Seekers who fit your listings</h2>
          <p className={styles.sectionLede}>
            Ranked by their real match score, with the components that produced
            it. A discovery aid, never a gate — anyone can still apply. Every
            send draws one credit from your monthly allowance.
          </p>
        </div>
      </div>
      <MatchedSeekerSourcing buckets={sourcingBuckets} entitlement={entitlement} />

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
              const reach = pct(entry.opened + entry.applied, entry.sent);
              return (
                <article key={entry.listingId} className={styles.funnelCard}>
                  <div className={styles.funnelHead}>
                    <div className={styles.funnelTitles}>
                      <h3 className={styles.funnelTitle}>{entry.listingTitle}</h3>
                      <p className={styles.funnelStats}>
                        {entry.sent} sent · {entry.opened} opened · {entry.applied}{" "}
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
                    aria-label={`${entry.listingTitle} invite engagement`}
                  >
                    <span
                      className={styles.trackFill}
                      style={{ width: `${Math.max(reach, 4)}%` }}
                    />
                  </div>
                  <div className={styles.funnelTags}>
                    <span className={styles.tag}>
                      <Icon name="action.view" size={16} aria-hidden />
                      {pct(entry.opened, entry.sent)}% opened
                    </span>
                    <span className={styles.tag}>
                      <Icon name="status.applied" size={16} aria-hidden />
                      {pct(entry.applied, entry.sent)}% applied
                    </span>
                    {entry.cold > 0 ? (
                      <span className={styles.tag}>{entry.cold} no response</span>
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
            pending. A withdrawn invite returns its credit only if it was never
            delivered.
          </p>
        </div>
      </div>
      <InvitesList invites={invites} listings={listings} />
    </section>
  );
}
