import type { CSSProperties } from "react";
import Link from "next/link";
import Image from "next/image";
import { Icon, VerifiedHostBadge } from "@explore-and-earn/ui";

import type {
  HostAnalytics,
  HostHiringPulse,
  HostListingSignal,
  RecentActivity,
} from "@explore-and-earn/db";
import { CATEGORY_ICON, CATEGORY_LABEL } from "../discovery";
import { formatDate } from "../../lib/format";
import {
  needsAttention,
  opportunityPerformance,
  pipelineFunnel,
  pulseTiles,
  upcomingEntries,
  type AttentionItem,
  type HostProfileCompleteness,
} from "./workspaceModel";
import { StaggerReveal } from "./StaggerReveal";
import styles from "./HostDashboard.module.css";

/**
 * The host overview — a recruiting command centre (spec D24).
 *
 * WHAT CHANGED, AND WHY IT HAD TO. The surface this replaces stacked a
 * "Getting started" checklist directly above a "What to do next" panel, and the
 * two disagreed on the same screen: the checklist could read 0/3 while the panel
 * said "You're all caught up." Beside them sat a "conversion radar" whose
 * headline percentage was the mean of three unrelated ratios, one of which
 * awarded a host 40 points for owning a draft. And the KPI figures carried the
 * literal strings "All-time" and "Review" where a trend belongs.
 *
 * So: ONE prioritised queue (workspaceModel.needsAttention), fed by real
 * records, with the evidence for each item printed under it. The composite score
 * is gone — it is replaced by the four counts that actually moved, each against
 * the same window a month earlier (getHostHiringPulse), which is the first real
 * comparison this product has ever been able to draw.
 *
 * NO WEATHER. The demo's weather panel is labelled "Sample data" because no
 * feed is wired. A real host's workspace does not get a sample-labelled forecast
 * where a real one would go.
 */

export interface PlanUsageRow {
  readonly id: string;
  readonly label: string;
  readonly used: number;
  /** Null when the entitlement could not be read — the row then says so. */
  readonly allowance: number | null;
  readonly note: string;
}

export interface HostDashboardProps {
  readonly companyName: string | null;
  readonly hostName: string | null;
  readonly location: string | null;
  /** The host's OWN cover photo. Never a stock scene standing in for one. */
  readonly coverPhotoUrl: string | null;
  readonly verified: boolean;
  readonly planLabel: string;
  /** hostAccountState() — 'prospect' | 'lapsed' | 'active' | 'cancelled' | null. */
  readonly accountState: string | null;
  readonly primaryLane: string | null;
  readonly profile: HostProfileCompleteness;
  readonly analytics: HostAnalytics;
  readonly pulse: HostHiringPulse;
  readonly signals: readonly HostListingSignal[];
  readonly applicationCounts: Readonly<Record<string, number>>;
  readonly newApplicationCounts: Readonly<Record<string, number>>;
  readonly unread: number;
  readonly planUsage: readonly PlanUsageRow[];
  readonly recentActivity: readonly RecentActivity[];
  /** The public employer page, when the profile exists. */
  readonly publicProfileHref: string | null;
}

const TONE_ICON = {
  urgent: "system.error",
  soon: "system.info",
  later: "system.info",
} as const;

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSeconds = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diffSeconds);
  if (abs < 60) return "just now";
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 3600) return rtf.format(Math.round(diffSeconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSeconds / 3600), "hour");
  return rtf.format(Math.round(diffSeconds / 86400), "day");
}

/**
 * Short calendar date for the upcoming rail. Goes through the formatter
 * chokepoint (`@/lib/format`) rather than an inline `toLocaleDateString`, which
 * is what guardrail G52 exists to keep true — the i18n wave needs ONE place to
 * thread a real locale through.
 */
function shortDate(iso: string): string {
  return Number.isNaN(new Date(iso).getTime())
    ? iso
    : formatDate(iso, { month: "short", day: "numeric" });
}

const ACTIVITY_ICON: Record<RecentActivity["type"], string> = {
  application: "action.apply",
  invite_sent: "action.forward",
  listing_published: "status.open",
};

function isCategoryKey(value: string): value is keyof typeof CATEGORY_LABEL {
  return Object.prototype.hasOwnProperty.call(CATEGORY_LABEL, value);
}

export function HostDashboard({
  companyName,
  hostName,
  location,
  coverPhotoUrl,
  verified,
  planLabel,
  accountState,
  primaryLane,
  profile,
  analytics,
  pulse,
  signals,
  applicationCounts,
  newApplicationCounts,
  unread,
  planUsage,
  recentActivity,
  publicProfileHref,
}: HostDashboardProps) {
  const liveCount = signals.filter((signal) => signal.status === "live").length;
  const funnel = pipelineFunnel(analytics.totalApplicationsByStatus);
  const newApplicants = analytics.totalApplicationsByStatus["applied"] ?? 0;
  const offersOutstanding = analytics.totalApplicationsByStatus["offered"] ?? 0;

  const attention = needsAttention({
    newApplicants,
    offersOutstanding,
    unreadMessages: unread,
    listings: signals,
    accountState,
    profile,
  });

  const opportunities = opportunityPerformance(
    signals,
    analytics,
    applicationCounts,
    newApplicationCounts,
  );
  const upcoming = upcomingEntries(signals);
  const tiles = pulseTiles(pulse);

  // The strongest next action IS the top of the queue — the two cannot disagree
  // because they are the same list.
  const primary: AttentionItem | undefined = attention[0];

  return (
    <StaggerReveal className={`host-page ${styles.overview}`}>
      {/* ── Identity & season band ───────────────────────────────────── */}
      <section
        className={styles.identity}
        data-lane={primaryLane ?? undefined}
        aria-labelledby="host-identity-heading"
      >
        <div className={styles.identityCover}>
          {coverPhotoUrl ? (
            <Image
              src={coverPhotoUrl}
              alt=""
              fill
              sizes="(max-width: 1023px) 100vw, 320px"
              className={styles.identityCoverImg}
              unoptimized
            />
          ) : (
            // No stand-in scene. A stock photograph here would read as this
            // host's own place, which is the one thing the photo catalog's
            // honesty rule forbids.
            <div className={styles.coverEmpty}>
              <Icon name="action.edit" size={20} aria-hidden />
              <p className={styles.coverEmptyText}>
                No cover photo yet — seekers see your operation here.
              </p>
              <Link className={styles.coverEmptyCta} href="/host/profile/edit">
                Add one
              </Link>
            </div>
          )}
        </div>

        <div className={styles.identityBody}>
          <div className={styles.identityMarks}>
            {verified ? <VerifiedHostBadge /> : null}
            <span className={styles.planPill}>{planLabel}</span>
            {accountState === "lapsed" ? (
              <span className={styles.lapsedPill}>Payment overdue</span>
            ) : null}
          </div>

          <h1 id="host-identity-heading" className={styles.identityTitle}>
            {companyName ?? "Your workspace"}
          </h1>

          <p className={styles.identityMeta}>
            {[hostName, location].filter(Boolean).join(" · ") ||
              "Add your name and home base so seekers know who is hiring."}
          </p>

          <dl className={styles.identityFacts}>
            <div className={styles.identityFact}>
              <dt>Live listings</dt>
              <dd className="ui-tabular">{liveCount}</dd>
            </div>
            <div className={styles.identityFact}>
              <dt>Profile</dt>
              <dd className="ui-tabular">
                {profile.filled}/{profile.total}
              </dd>
            </div>
            <div className={styles.identityFact}>
              <dt>In pipeline</dt>
              <dd className="ui-tabular">{funnel.total}</dd>
            </div>
          </dl>

          <div className={styles.identityActions}>
            {primary ? (
              <Link className={styles.primaryCta} href={primary.href}>
                <Icon name="action.forward" size={18} aria-hidden />
                {primary.title}
              </Link>
            ) : (
              <Link className={styles.primaryCta} href="/host/listings/new">
                <Icon name="status.open" size={18} aria-hidden />
                Post another opportunity
              </Link>
            )}
            {publicProfileHref ? (
              <Link className={styles.ghostCta} href={publicProfileHref}>
                <Icon name="action.view" size={18} aria-hidden />
                View public profile
              </Link>
            ) : null}
          </div>

          {!profile.complete ? (
            <p className={styles.identityHint}>
              Still blank: {profile.missing.join(", ")}.{" "}
              <Link href="/host/profile/edit">Finish your profile</Link>
            </p>
          ) : null}
        </div>
      </section>

      {/* ── Hiring pulse ─────────────────────────────────────────────── */}
      <section className="host-panel host-panel--raised" aria-labelledby="pulse-heading">
        <div className="host-panel__head">
          <div className="host-panel__titles">
            <span className="host-panel__eyebrow">Last {pulse.windowDays} days</span>
            <h2 id="pulse-heading" className="host-panel__title">
              Hiring pulse
            </h2>
          </div>
          <Link className="host-panel__action" href="/host/analytics">
            Full analytics
            <Icon name="action.forward" size={16} aria-hidden />
          </Link>
        </div>

        {pulse.measurable ? (
          <ul className={styles.pulseGrid}>
            {tiles.map((tile) => (
              <li key={tile.id} className={styles.pulseTile}>
                <Link className={styles.pulseLink} href={tile.href}>
                  <span className={styles.pulseLabel}>{tile.label}</span>
                  <span className={`${styles.pulseValue} ui-tabular`}>{tile.value}</span>
                  {tile.trend ? (
                    <span className={styles.pulseTrend} data-tone={tile.trendTone}>
                      {tile.trend}
                    </span>
                  ) : (
                    // Two empty windows in a row. "0%" would imply a measured
                    // ratio; there was nothing to measure.
                    <span className={styles.pulseTrendMuted}>No activity either period</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.teach}>
            <p className={styles.teachTitle}>Nothing to compare yet</p>
            <p className={styles.teachBody}>
              Your pulse starts the moment a listing goes live — applications,
              invites, and take-up, each against the month before. Until then
              there is no period to measure.
            </p>
            <div className={styles.teachLinks}>
              <Link className={styles.teachCta} href="/host/listings/new">
                Create a listing
              </Link>
              <Link className={styles.teachGhost} href="/for-hosts/demo">
                See a season in progress
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* ── Needs attention — THE single prioritised queue ───────────── */}
      <section className="host-panel host-panel--raised" aria-labelledby="attention-heading">
        <div className="host-panel__head">
          <div className="host-panel__titles">
            <span className="host-panel__eyebrow">Needs attention</span>
            <h2 id="attention-heading" className="host-panel__title">
              {attention.length > 0
                ? `${attention.length} thing${attention.length === 1 ? "" : "s"} to handle`
                : "Nothing waiting on you"}
            </h2>
          </div>
        </div>

        {attention.length > 0 ? (
          <ol className={styles.attentionList}>
            {attention.map((item) => (
              <li key={item.id}>
                <Link className={styles.attentionItem} href={item.href} data-tone={item.tone}>
                  {typeof item.count === "number" ? (
                    <span className={`${styles.attentionCount} ui-tabular`}>{item.count}</span>
                  ) : (
                    <span className={styles.attentionMark} aria-hidden>
                      <Icon name={TONE_ICON[item.tone]} size={18} />
                    </span>
                  )}
                  <span className={styles.attentionText}>
                    <span className={styles.attentionTitle}>{item.title}</span>
                    {/* The record this was counted from — never advice. */}
                    <span className={styles.attentionEvidence}>{item.evidence}</span>
                  </span>
                  <Icon name="action.forward" size={18} aria-hidden />
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.clear}>
            <Icon name="system.success" size={18} aria-hidden />
            Every applicant has been looked at, every message answered, and no
            deadline is inside two weeks.
          </p>
        )}
      </section>

      <div className={styles.twoCol}>
        {/* ── Pipeline funnel ────────────────────────────────────────── */}
        <section className="host-panel host-panel--raised" aria-labelledby="funnel-heading">
          <div className="host-panel__head">
            <div className="host-panel__titles">
              <span className="host-panel__eyebrow">All time</span>
              <h2 id="funnel-heading" className="host-panel__title">
                Applicant pipeline
              </h2>
            </div>
            <Link className="host-panel__action" href="/host/applicants">
              Open pipeline
              <Icon name="action.forward" size={16} aria-hidden />
            </Link>
          </div>

          {funnel.total > 0 ? (
            <>
              <p className={styles.funnelLede}>
                <span className={`${styles.funnelPct} ui-tabular`}>
                  {funnel.advancedPercent}%
                </span>
                <span>
                  moved past the first look
                  <span className={styles.funnelSub}>
                    {funnel.total - funnel.steps[0]!.count} of {funnel.total} applications
                  </span>
                </span>
              </p>
              <ul className={styles.funnel}>
                {funnel.steps.map((step) => (
                  <li
                    key={step.id}
                    className={styles.funnelRow}
                    style={
                      {
                        "--pct": `${
                          funnel.total > 0
                            ? Math.round((step.count / funnel.total) * 100)
                            : 0
                        }%`,
                      } as CSSProperties
                    }
                  >
                    <span className={styles.funnelLabel}>{step.label}</span>
                    <span className={`${styles.funnelCount} ui-tabular`}>{step.count}</span>
                    <span className={styles.funnelTrack} aria-hidden>
                      <span />
                    </span>
                  </li>
                ))}
              </ul>
              {funnel.closed > 0 ? (
                <p className={styles.funnelFoot}>
                  {funnel.closed} closed (not selected, withdrawn, or expired) — counted
                  in the total, not a stage.
                </p>
              ) : null}
            </>
          ) : (
            <div className={styles.teach}>
              <p className={styles.teachTitle}>No applications yet</p>
              <p className={styles.teachBody}>
                Applicants arrive at &ldquo;Applied&rdquo; and move through review,
                shortlist, and offer. You can also invite seekers directly.
              </p>
              <div className={styles.teachLinks}>
                <Link className={styles.teachCta} href="/host/outreach">
                  Invite seekers
                </Link>
                <Link className={styles.teachGhost} href="/for-hosts/demo/applicants">
                  See a full pipeline
                </Link>
              </div>
            </div>
          )}
        </section>

        {/* ── Upcoming ───────────────────────────────────────────────── */}
        <section className="host-panel host-panel--raised" aria-labelledby="upcoming-heading">
          <div className="host-panel__head">
            <div className="host-panel__titles">
              <span className="host-panel__eyebrow">Ahead</span>
              <h2 id="upcoming-heading" className="host-panel__title">
                Dates coming up
              </h2>
            </div>
          </div>
          {upcoming.length > 0 ? (
            <ol className={styles.upcoming}>
              {upcoming.map((entry) => (
                <li key={entry.id}>
                  <Link className={styles.upcomingRow} href={entry.href} data-tone={entry.tone}>
                    <time className={`${styles.upcomingDate} ui-tabular`} dateTime={entry.at}>
                      {shortDate(entry.at)}
                    </time>
                    <span className={styles.upcomingText}>
                      <span className={styles.upcomingTitle}>{entry.title}</span>
                      <span className={styles.upcomingDetail}>{entry.detail}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.muted}>
              Nothing dated ahead. Application deadlines and season start dates
              appear here once a listing is live.
            </p>
          )}
        </section>
      </div>

      {/* ── Opportunity performance ──────────────────────────────────── */}
      {opportunities.length > 0 ? (
        <section className="host-panel host-panel--raised" aria-labelledby="performance-heading">
          <div className="host-panel__head">
            <div className="host-panel__titles">
              <span className="host-panel__eyebrow">Performance</span>
              <h2 id="performance-heading" className="host-panel__title">
                Your open opportunities
              </h2>
            </div>
            <Link className="host-panel__action" href="/host/listings">
              All listings
              <Icon name="action.forward" size={16} aria-hidden />
            </Link>
          </div>

          <ul className={styles.opportunityGrid}>
            {opportunities.map(
              ({ signal, applications, newApplications, invitesSent, invitesAccepted }) => {
                const cat = isCategoryKey(signal.category) ? signal.category : null;
                return (
                  <li key={signal.listingId} className={styles.opportunity}>
                    <div className={styles.opportunityCover} data-lane={signal.category}>
                      {signal.coverPhotoUrl ? (
                        <Image
                          src={signal.coverPhotoUrl}
                          alt=""
                          fill
                          sizes="(max-width: 767px) 100vw, 320px"
                          className={styles.opportunityCoverImg}
                          unoptimized
                        />
                      ) : (
                        <span className={styles.opportunityWatermark} aria-hidden>
                          <Icon name={cat ? CATEGORY_ICON[cat] : "category.mix"} size={22} />
                        </span>
                      )}
                      <span className="host-status" data-state={signal.status === "live" ? "open" : "closed"}>
                        {signal.status === "live" ? "Live" : "Paused"}
                      </span>
                    </div>

                    <div className={styles.opportunityBody}>
                      <h3 className={styles.opportunityTitle}>
                        <Link href={`/host/listings/${signal.listingId}`}>{signal.title}</Link>
                      </h3>
                      <p className={styles.opportunityMeta}>
                        {[
                          cat ? CATEGORY_LABEL[cat] : null,
                          signal.locationDisplay,
                          signal.readiness.daysUntilDeadline !== null
                            ? `closes in ${signal.readiness.daysUntilDeadline}d`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>

                      <dl className={styles.opportunityStats}>
                        <div>
                          <dt>Applications</dt>
                          <dd className="ui-tabular">{applications}</dd>
                        </div>
                        <div>
                          <dt>New</dt>
                          <dd className="ui-tabular">{newApplications}</dd>
                        </div>
                        {/* Invite figures are the paid analytics scope. Absent
                            means "your plan does not include this", which is not
                            the same as zero — so the columns simply do not render. */}
                        {invitesSent !== null ? (
                          <div>
                            <dt>Invites</dt>
                            <dd className="ui-tabular">{invitesSent}</dd>
                          </div>
                        ) : null}
                        {invitesAccepted !== null ? (
                          <div>
                            <dt>Taken up</dt>
                            <dd className="ui-tabular">{invitesAccepted}</dd>
                          </div>
                        ) : null}
                      </dl>

                      {signal.readiness.gaps.length > 0 ? (
                        <p className={styles.opportunityGap}>
                          <Icon name="system.info" size={14} aria-hidden />
                          {signal.readiness.gaps[0]!.reason}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              },
            )}
          </ul>
        </section>
      ) : null}

      <div className={styles.twoCol}>
        {/* ── Communications ─────────────────────────────────────────── */}
        <section className="host-panel host-panel--raised" aria-labelledby="comms-heading">
          <div className="host-panel__head">
            <div className="host-panel__titles">
              <span className="host-panel__eyebrow">Conversations</span>
              <h2 id="comms-heading" className="host-panel__title">
                Messages
              </h2>
            </div>
            <Link className="host-panel__action" href="/host/messages">
              Open inbox
              <Icon name="action.forward" size={16} aria-hidden />
            </Link>
          </div>
          <p className={styles.commsLede}>
            {unread > 0 ? (
              <>
                <span className={`${styles.commsCount} ui-tabular`}>{unread}</span>
                <span>
                  unread {unread === 1 ? "message" : "messages"} from seekers
                </span>
              </>
            ) : (
              <span className={styles.muted}>
                No unread messages. Replies you send show up in the applicant&rsquo;s
                thread.
              </span>
            )}
          </p>

          {recentActivity.length > 0 ? (
            <ol className={styles.activity}>
              {recentActivity.slice(0, 5).map((item) => (
                <li key={item.id} className={styles.activityRow}>
                  <span className={styles.activityIcon} aria-hidden>
                    <Icon
                      name={ACTIVITY_ICON[item.type] as Parameters<typeof Icon>[0]["name"]}
                      size={14}
                    />
                  </span>
                  <span className={styles.activityText}>{item.description}</span>
                  <time className={styles.activityTime} dateTime={item.timestamp}>
                    {relativeTime(item.timestamp)}
                  </time>
                </li>
              ))}
            </ol>
          ) : null}
        </section>

        {/* ── Plan usage ─────────────────────────────────────────────── */}
        <section className="host-panel host-panel--raised" aria-labelledby="plan-heading">
          <div className="host-panel__head">
            <div className="host-panel__titles">
              <span className="host-panel__eyebrow">{planLabel}</span>
              <h2 id="plan-heading" className="host-panel__title">
                Plan usage
              </h2>
            </div>
            <Link className="host-panel__action" href="/host/billing">
              Billing
              <Icon name="action.forward" size={16} aria-hidden />
            </Link>
          </div>
          <ul className={styles.usage}>
            {planUsage.map((row) => (
              <li key={row.id} className={styles.usageRow}>
                <span className={styles.usageLabel}>{row.label}</span>
                <span className={`${styles.usageValue} ui-tabular`}>
                  {row.allowance === null ? row.used : `${row.used} / ${row.allowance}`}
                </span>
                {row.allowance !== null && row.allowance > 0 ? (
                  <span
                    className={styles.usageTrack}
                    style={
                      {
                        "--pct": `${Math.min(100, Math.round((row.used / row.allowance) * 100))}%`,
                      } as CSSProperties
                    }
                    aria-hidden
                  >
                    <span />
                  </span>
                ) : null}
                <span className={styles.usageNote}>{row.note}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </StaggerReveal>
  );
}
