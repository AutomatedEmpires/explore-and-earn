import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { getHostInvites, getHostListings } from "@explore-and-earn/db";
import type { HostInvite, ListingRow } from "@explore-and-earn/db/client";
import { Chip, Icon, MetricCard, MetricGrid } from "@explore-and-earn/ui";

import { HostSectionHeading } from "../../../../components/host";
import { EmptyState } from "../../../../components/discovery";
import { InvitesList } from "./InvitesList";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Invites" };

// Per-host, never statically cached.
export const dynamic = "force-dynamic";

/** Statuses that mean the seeker opened/engaged the invite. */
const OPENED_STATUSES = new Set(["viewed", "applied"]);
/** Terminal-negative statuses — count as sent but not "in flight". */
const COLD_STATUSES = new Set(["ignored", "expired", "withdrawn"]);

/** A campaign = all invites a host sent for one listing, with its funnel. */
interface InviteCampaign {
  readonly listingId: string;
  readonly listingTitle: string;
  readonly sent: number;
  readonly opened: number;
  readonly applied: number;
  readonly cold: number;
  readonly latestAt: string;
}

/** Group invites by listing into campaigns, freshest campaign first. */
function toCampaigns(invites: readonly HostInvite[]): InviteCampaign[] {
  const byListing = new Map<string, InviteCampaign>();
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
          invite.createdAt > existing.latestAt
            ? invite.createdAt
            : existing.latestAt,
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
  return [...byListing.values()].sort((a, b) =>
    b.latestAt.localeCompare(a.latestAt),
  );
}

/** Tone + label for a campaign's status pill, driven by its real funnel. */
function campaignTone(c: InviteCampaign): { tone: string; label: string } {
  if (c.applied > 0) return { tone: "hot", label: "Converting" };
  if (c.opened > 0) return { tone: "live", label: "Active" };
  if (c.sent > c.cold) return { tone: "live", label: "Awaiting" };
  return { tone: "draft", label: "Cold" };
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}


export default async function HostInvitesPage() {
  const { userId, getToken } = await auth();
  const token = userId ? await getToken() : null;

  if (!userId || !token) {
    return (
      <section className={styles.block}>
        <HostSectionHeading
          title="Invites"
          description="Sign in as a host to send and track your invites."
        />
        <EmptyState
          title="Sign in to manage invites"
          message="You need to be signed in as a host to view your sent invites."
        />
      </section>
    );
  }

  const [invites, listings] = await Promise.all([
    getHostInvites(token, userId).catch(() => [] as HostInvite[]),
    getHostListings(token, userId).catch(() => [] as ListingRow[]),
  ]);

  // --- Real metrics derived from the invite data --------------------------
  const sent = invites.length;
  const opened = invites.filter((i) => OPENED_STATUSES.has(i.status)).length;
  const applied = invites.filter((i) => i.status === "applied").length;
  const openRate = pct(opened, sent);
  const applyRate = pct(applied, sent);
  const campaigns = toCampaigns(invites);

  const roleOptions =
    listings.length > 0
      ? listings.map((l) => l.title)
      : ["Create a listing to target a role"];

  return (
    <section className={styles.block}>
      <HostSectionHeading
        eyebrow="Outbound recruiting"
        title="Invites should feel targeted, not spammy."
        description="Build campaigns from role fit, timeline, and profile strength — then track every invite from sent to applied."
      />

      <MetricGrid>
        <MetricCard
          label="Invites sent"
          value={sent.toLocaleString()}
          trend={sent > 0 ? "All-time" : "None yet"}
          trendTone="neutral"
        />
        <MetricCard
          label="Open rate"
          value={`${openRate}%`}
          trend={sent > 0 ? `${opened} opened` : "—"}
          trendTone={openRate >= 40 ? "up" : "neutral"}
        />
        <MetricCard
          label="Invite-to-apply"
          value={`${applyRate}%`}
          trend={sent > 0 ? `${applied} applied` : "—"}
          trendTone={applyRate >= 15 ? "up" : "neutral"}
        />
      </MetricGrid>

      <div className={styles.split}>
        {/* --- Campaign builder (planning surface) ------------------------ */}
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <div className={styles.panelTitles}>
              <h2 className={styles.panelTitle}>Campaign builder</h2>
              <p className={styles.panelSub}>
                Shape the audience and the message, then send from your seeker
                search.
              </p>
            </div>
            <Chip icon="action.edit">Planning aid</Chip>
          </div>

          <div className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="campaign-role">
                Role
              </label>
              <select
                id="campaign-role"
                className={styles.select}
                defaultValue={roleOptions[0]}
              >
                {roleOptions.map((title, i) => (
                  <option key={`${title}-${i}`} value={title}>
                    {title}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="campaign-audience">
                Audience
              </label>
              <select id="campaign-audience" className={styles.select}>
                <option>Seekers in your category</option>
                <option>Ready-now seekers</option>
                <option>Seekers needing housing</option>
                <option>Open to all seekers</option>
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="campaign-timeline">
                Timeline
              </label>
              <select id="campaign-timeline" className={styles.select}>
                <option>Ready now to 1 month</option>
                <option>1–3 months</option>
                <option>3–6 months</option>
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="campaign-volume">
                Volume
              </label>
              <select id="campaign-volume" className={styles.select}>
                <option>20 high-quality invites</option>
                <option>50 broad invites</option>
              </select>
            </div>
            <div className={`${styles.field} ${styles.fieldFull}`}>
              <label className={styles.label} htmlFor="campaign-message">
                Message angle
              </label>
              <textarea
                id="campaign-message"
                className={styles.textarea}
                defaultValue="We think you could be a strong fit for our seasonal role. Housing is available, the work is hands-on, and your timeline looks aligned."
              />
            </div>
          </div>

          <p className={styles.builderNote}>
            <Icon name="system.info" size={16} aria-hidden />
            This builder is a planning aid, not an automatic match engine —
            nothing here sends on its own. Use it to shape your angle, then pick
            a listing below and open seeker search to send real, personalized
            invites. Every send is tracked as a campaign.
          </p>
        </div>

        {/* --- Live campaigns (real, grouped by listing) ------------------ */}
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <div className={styles.panelTitles}>
              <h2 className={styles.panelTitle}>Live campaigns</h2>
              <p className={styles.panelSub}>
                Each listing&apos;s invite funnel, from sent to applied.
              </p>
            </div>
            <Chip icon="action.forward">{`${campaigns.length}`}</Chip>
          </div>

          {campaigns.length === 0 ? (
            <div className={styles.empty}>
              <Icon name="action.forward" size={24} aria-hidden />
              <p>
                No campaigns yet. Invite seekers to a listing and they&apos;ll
                appear here grouped into a tracked campaign.
              </p>
            </div>
          ) : (
            <div className={styles.campaigns}>
              {campaigns.map((c) => {
                const { tone, label } = campaignTone(c);
                const reach = pct(c.opened + c.applied, c.sent);
                return (
                  <article key={c.listingId} className={styles.campaign}>
                    <div className={styles.campaignHead}>
                      <div className={styles.campaignTitles}>
                        <h3 className={styles.campaignTitle}>
                          {c.listingTitle}
                        </h3>
                        <p className={styles.campaignStats}>
                          {c.sent} sent · {c.opened} opened · {c.applied} applied
                        </p>
                      </div>
                      <span className={styles.pill} data-tone={tone}>
                        {label}
                      </span>
                    </div>
                    <div
                      className={styles.funnel}
                      role="meter"
                      aria-valuenow={reach}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${c.listingTitle} engagement`}
                    >
                      <span
                        className={styles.funnelFill}
                        style={{ width: `${Math.max(reach, 4)}%` }}
                      />
                    </div>
                    <div className={styles.campaignTags}>
                      <span className={styles.tag}>
                        <Icon name="action.view" size={16} aria-hidden />
                        {pct(c.opened, c.sent)}% open
                      </span>
                      <span className={styles.tag}>
                        <Icon name="status.applied" size={16} aria-hidden />
                        {pct(c.applied, c.sent)}% apply
                      </span>
                      {c.cold > 0 ? (
                        <span className={styles.tag}>
                          {c.cold} cold
                        </span>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* --- Sent invites + the real send/withdraw flow (unchanged) -------- */}
      <div className={styles.section}>
        <div className={styles.sectionText}>
          <h2 className={styles.sectionTitle}>Sent invites</h2>
          <p className={styles.sectionLede}>
            Seekers you have invited to apply to your listings — withdraw any
            that are still pending.
          </p>
        </div>
      </div>
      <InvitesList invites={invites} listings={listings} />
    </section>
  );
}
