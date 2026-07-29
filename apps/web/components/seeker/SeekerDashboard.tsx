import Image from "next/image";
import Link from "next/link";

import { Icon } from "@explore-and-earn/ui";
import type { ApplicationWithListing } from "@explore-and-earn/db";
import type { SeekerProfileRecord } from "@explore-and-earn/db";

import { formatDate } from "../../lib/format";
import { MatchCardRail } from "./MatchCardRail";
import { ReadinessIsland } from "./ReadinessIsland";
import styles from "./SeekerDashboard.module.css";
import { APPLICATION_STATUS_LABEL, type ApplicationStatus } from "./models";
import {
  buildSeasonLine,
  buildWeekQueue,
  composeLede,
  daysUntil,
  formatDayDate,
  movementLine,
  nextStepLine,
  relativeRecency,
  type SeasonBoard,
} from "./seasonBoard";

export interface SeekerDashboardProps {
  readonly profile: SeekerProfileRecord | null;
  readonly board: SeasonBoard;
  readonly seekerName: string;
}

/**
 * /home — the seeker's season headquarters ("Basecamp", redesign W1).
 *
 * STRUCTURE IS THE PROMISE. The page reads top to bottom as the season does:
 * the decision on the table (offer as a full object, never a sentence), the
 * week's deadlines, the season drawn on one line, readiness, the applications
 * in motion, the shortlist being watched, and only then fresh matches. Every
 * date on this page came from a row; every "Host viewed" is applications
 * .viewed_at; a missing date removes its line rather than approximating it
 * (see seasonBoard.ts — the honesty contract lives there, with tests).
 *
 * DISTINCT FROM DISCOVERY, BY CONSTRUCTION (V2-G invariant, kept): Seek,
 * Swipe and Map render as LINKS in a slim row — never embeds — so the
 * dashboard cannot swallow the marketplace again. The ids on those links and
 * on the Saved pipeline cell are coachmark anchors (SeekerCoachmarks).
 *
 * SERVER COMPONENT: time-derived strings are computed once per request with a
 * single clock; the availability control is the page's one client island.
 */

const DISCOVERY_MODES = [
  { href: "/seek", id: "seeker-mode-seek", label: "Seek", icon: "nav.seek" },
  { href: "/swipe", id: "seeker-mode-swipe", label: "Swipe", icon: "nav.swipe" },
  { href: "/map", id: "seeker-mode-map", label: "Map", icon: "nav.map" },
] as const;

/** Category → cover-gradient token, for offers whose listing has no photo. */
const CATEGORY_GRADIENT: Record<string, string> = {
  farm: "var(--gradient-category-farm)",
  maritime: "var(--gradient-category-maritime)",
  remote: "var(--gradient-category-remote)",
  seasonal: "var(--gradient-category-seasonal)",
  mix: "var(--gradient-category-mix)",
};

function benefitWord(provision: string, yes: string, no: string): string {
  return provision === "provided" ? yes : no;
}

function seasonWindow(application: ApplicationWithListing): string {
  const listing = application.listing;
  if (!listing) return "";
  if (listing.begins && listing.ends) {
    const format = (iso: string) =>
      formatDate(iso, { month: "short", day: "numeric" });
    return `${format(listing.begins)} – ${format(listing.ends)}`;
  }
  return listing.opportunityWindow;
}

/* ─── The consequential object: a pending offer, rendered in full ─── */

function OfferObject({
  offer,
  now,
}: {
  readonly offer: ApplicationWithListing;
  readonly now: Date;
}) {
  const listing = offer.listing;
  if (!listing) return null;
  const days = daysUntil(offer.expiresAt, now);

  return (
    <section className={styles.offer} aria-labelledby="offer-heading">
      <div className={styles.offerPhoto}>
        {listing.coverPhotoUrl ? (
          <Image
            src={listing.coverPhotoUrl}
            alt=""
            fill
            sizes="(max-width: 1024px) 100vw, 380px"
            style={{ objectFit: "cover" }}
          />
        ) : (
          <div
            className={styles.offerPhotoFallback}
            style={{ background: CATEGORY_GRADIENT[listing.category] ?? CATEGORY_GRADIENT.mix }}
            aria-hidden="true"
          />
        )}
        <span className={styles.offerChip}>
          {days != null && days >= 0
            ? `Offer · ${days === 0 ? "decide today" : `${days} day${days === 1 ? "" : "s"} left`}`
            : "Offer"}
        </span>
        <span className={styles.offerPlace}>{listing.location}</span>
      </div>
      <div className={styles.offerBody}>
        {offer.expiresAt ? (
          <p className={styles.offerReceived}>
            Decide by <strong>{formatDayDate(offer.expiresAt)}</strong>
          </p>
        ) : (
          <p className={styles.offerReceived}>Offer received</p>
        )}
        <h2 id="offer-heading" className={styles.offerTitle}>
          {listing.title}
        </h2>
        <p className={styles.offerHost}>
          {listing.host.name !== "Unknown Host" ? `${listing.host.name} · ` : ""}
          {listing.location}
        </p>
        <dl className={styles.offerFacts}>
          <div>
            <dt>Pay</dt>
            <dd>{listing.benefits.pay.summary}</dd>
          </div>
          <div>
            <dt>Season</dt>
            <dd>{seasonWindow(offer)}</dd>
          </div>
          <div>
            <dt>Housing</dt>
            <dd>{benefitWord(listing.benefits.housing.provision, "Included", "Not included")}</dd>
          </div>
          <div>
            <dt>Meals</dt>
            <dd>{benefitWord(listing.benefits.meals.provision, "Included", "Not included")}</dd>
          </div>
        </dl>
        <div className={styles.offerActions}>
          <Link href="/offered" className={styles.offerPrimary}>
            Review the offer
            <span aria-hidden="true"> →</span>
          </Link>
          <Link href="/messages" className={styles.offerSecondary}>
            Ask a question
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ─── Root ─── */

export function SeekerDashboard({ profile, board, seekerName }: SeekerDashboardProps) {
  const now = new Date();
  const firstName = seekerName.trim().split(/\s+/)[0] || "there";

  const lede = composeLede(board, now);
  const week = buildWeekQueue(board, now);
  const line = buildSeasonLine(board, now);
  const leadOffer = board.offers.find((offer) => offer.listing) ?? null;

  const decideDays =
    leadOffer?.expiresAt != null ? daysUntil(leadOffer.expiresAt, now) : null;
  const seasonStarts = [...board.accepted, ...board.offers]
    .map((application) => application.listing?.begins)
    .filter((iso): iso is string => Boolean(iso))
    .map((iso) => daysUntil(iso, now))
    .filter((days): days is number => days != null && days >= 0)
    .sort((a, b) => a - b);

  const pipeline = [
    { href: "/seek", label: "Matched", count: board.matches.length, id: undefined },
    { href: "/saved", label: "Saved", count: board.status.savedCount, id: "seeker-glance-saved" },
    { href: "/applied", label: "Applied", count: board.status.appliedCount, id: undefined },
    { href: "/offered", label: "Offers", count: board.status.offersCount, id: undefined },
    { href: "/accepted", label: "Accepted", count: board.status.acceptedCount, id: undefined },
  ] as const;

  return (
    <div className={styles.main}>
      {/* Season header: identity, the written lede, the numbers that matter. */}
      <header className={styles.header}>
        <div className={styles.headerText}>
          <p className={styles.eyebrow}>
            {`Welcome back, ${firstName} — ${formatDate(now.toISOString(), {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}`}
          </p>
          <h1 className={styles.title}>
            Your season<span className={styles.titleMark}>.</span>
          </h1>
          <p className={styles.lede}>{lede.sentence}</p>
          {lede.aside ? <p className={styles.aside}>{lede.aside}</p> : null}
        </div>
        <div className={styles.numerals} role="group" aria-label="Season at a glance">
          {decideDays != null && decideDays >= 0 ? (
            <div className={`${styles.numeral} ${styles.numeralUrgent}`}>
              <b className="ui-tabular">{decideDays}</b>
              <span>{decideDays === 1 ? "day" : "days"} to decide on your offer</span>
            </div>
          ) : null}
          {seasonStarts.length > 0 ? (
            <div className={styles.numeral}>
              <b className="ui-tabular">{seasonStarts[0]}</b>
              <span>days until the season opens</span>
            </div>
          ) : null}
          <div className={styles.numeral}>
            <b className="ui-tabular">{board.status.appliedCount}</b>
            <span>{board.status.appliedCount === 1 ? "application" : "applications"} in play</span>
          </div>
        </div>
      </header>

      {/* The decision on the table — rendered as the full object it is. When
          the offer's listing cannot be read (paused, removed), the offer still
          surfaces: a claim with a destination, never a silent drop. */}
      {leadOffer ? (
        <OfferObject offer={leadOffer} now={now} />
      ) : board.offers.length > 0 ? (
        <Link href="/offered" className={styles.offerFallback}>
          <span>
            {board.offers.length === 1
              ? "An offer is waiting for your review"
              : `${board.offers.length} offers are waiting for your review`}
          </span>
          <span aria-hidden="true">→</span>
        </Link>
      ) : null}

      {/* This week: everything with a real deadline, in deadline order. */}
      {week.length > 0 ? (
        <section className={styles.week} aria-labelledby="week-heading">
          <div className={styles.sectionHead}>
            <h2 id="week-heading" className={styles.sectionKicker}>
              This week
            </h2>
            <span className={styles.sectionNote}>
              {week.length} item{week.length === 1 ? "" : "s"} · ordered by deadline
            </span>
          </div>
          <ol className={styles.weekList}>
            {week.map((row) => (
              <li key={row.key} className={styles.weekRow}>
                <div
                  className={`${styles.weekDay} ${row.urgent ? styles.weekDayUrgent : ""}`}
                >
                  <b>{row.dayLabel}</b>
                  <span>{row.dateLabel}</span>
                </div>
                <div className={styles.weekBody}>
                  <h3>{row.title}</h3>
                  <p>{row.sub}</p>
                </div>
                <Link
                  href={row.ctaHref}
                  className={`${styles.weekAction} ${row.primary ? styles.weekActionPrimary : ""}`}
                >
                  {row.ctaLabel}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* The season on one line — only when real dates exist to draw. */}
      {line ? (
        <section className={styles.line} aria-labelledby="line-heading">
          <div className={styles.sectionHead}>
            <h2 id="line-heading" className={styles.sectionKicker}>
              Season timeline
            </h2>
            <span className={styles.sectionNote}>every date is real</span>
          </div>
          <div className={styles.lineBand}>
            {line.monthTicks.map((tick) => (
              <span
                key={tick.label + tick.pct}
                className={styles.lineTick}
                style={{ left: `${tick.pct}%` }}
              >
                {tick.label}
              </span>
            ))}
            {line.marks.map((mark) => (
              <span
                key={mark.key}
                className={`${styles.lineMark} ${styles[`lineMark_${mark.kind}`] ?? ""}`}
                style={{ left: `${mark.pct}%` }}
              >
                <i aria-hidden="true" />
                {mark.label}
              </span>
            ))}
            <div className={styles.lineLanes}>
              {line.spans.slice(0, 4).map((span) => (
                <div key={span.key} className={styles.lineLane}>
                  <span
                    className={`${styles.lineSpan} ${styles[`lineSpan_${span.kind}`] ?? ""}`}
                    style={{ left: `${span.startPct}%`, width: `${Math.max(4, span.endPct - span.startPct)}%` }}
                  >
                    {span.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* Readiness + correspondence, side by side where width allows. */}
      <div
        className={`${styles.duo} ${board.threads.length === 0 ? styles.duoSingle : ""}`}
      >
        <section className={styles.module} aria-labelledby="ready-heading">
          <div className={styles.sectionHead}>
            <h2 id="ready-heading" className={styles.sectionKicker}>
              Ready to go?
            </h2>
            <Link href="/resume" className={styles.sectionLink}>
              Résumé · {board.status.resumeCompletion}%
            </Link>
          </div>
          <div
            className={styles.resumeBar}
            role="img"
            aria-label={`Résumé ${board.status.resumeCompletion} percent complete`}
          >
            <i style={{ width: `${Math.min(100, Math.max(0, board.status.resumeCompletion))}%` }} />
          </div>
          <ReadinessIsland initialValue={profile?.seekingTimeline ?? null} />
          {board.accepted.length > 0 || leadOffer ? (
            <Link href="/travel" className={styles.travelRow}>
              Plan your travel
              {seasonStarts.length > 0 ? ` — the season opens in ${seasonStarts[0]} days` : ""}
              <span aria-hidden="true"> →</span>
            </Link>
          ) : null}
        </section>

        {board.threads.length > 0 ? (
          <section className={styles.module} aria-labelledby="mail-heading">
            <div className={styles.sectionHead}>
              <h2 id="mail-heading" className={styles.sectionKicker}>
                Conversations
              </h2>
              <span className={styles.sectionNote}>{board.threads.length} thread{board.threads.length === 1 ? "" : "s"}</span>
            </div>
            <ul className={styles.mailList}>
              {board.threads.slice(0, 3).map((thread) => (
                <li key={thread.id}>
                  <Link href="/messages" className={styles.mailRow}>
                    <span className={styles.mailWith}>{thread.withName}</span>
                    <span className={styles.mailWhen}>
                      {relativeRecency(thread.lastMessageAt, now) ?? "—"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/messages" className={styles.moduleFoot}>
              Open inbox <span aria-hidden="true">→</span>
            </Link>
          </section>
        ) : null}
      </div>

      {/* In motion: each application as an object with its last movement. */}
      {board.inMotion.length > 0 || board.closedRecent.length > 0 ? (
        <section className={styles.motion} aria-labelledby="motion-heading">
          <div className={styles.sectionHead}>
            <h2 id="motion-heading" className={styles.sectionKicker}>
              In motion
            </h2>
            <Link href="/applied" className={styles.sectionLink}>
              All applications <span aria-hidden="true">→</span>
            </Link>
          </div>
          <ul className={styles.motionList}>
            {board.inMotion.map((application) => (
              <li key={application.id} className={styles.motionRow}>
                <div className={styles.motionMain}>
                  <h3>{application.listing?.title ?? "A listing that is no longer visible"}</h3>
                  <p>
                    {application.listing
                      ? `${application.listing.location} · ${seasonWindow(application)}`
                      : "The host has paused or removed this listing"}
                  </p>
                </div>
                <span
                  className={styles.stageChip}
                  data-stage={application.status}
                >
                  {APPLICATION_STATUS_LABEL[application.status as ApplicationStatus] ??
                    application.status}
                </span>
                <div className={styles.motionMeta}>
                  <span>{movementLine(application, now)}</span>
                  <span className={styles.motionNext}>{nextStepLine(application)}</span>
                </div>
              </li>
            ))}
            {board.closedRecent.map((application) => (
              <li
                key={application.id}
                className={`${styles.motionRow} ${styles.motionRowClosed}`}
              >
                <div className={styles.motionMain}>
                  <h3>{application.listing?.title ?? "A closed application"}</h3>
                  <p>{application.listing?.location ?? ""}</p>
                </div>
                <span className={`${styles.stageChip} ${styles.stageChipClosed}`}>
                  {APPLICATION_STATUS_LABEL[application.status as ApplicationStatus] ??
                    application.status}
                </span>
                <div className={styles.motionMeta}>
                  <span>No action — archived</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Watching: the shortlist, nearest deadline first. */}
      {board.watching.length > 0 ? (
        <section className={styles.watching} aria-labelledby="watching-heading">
          <div className={styles.sectionHead}>
            <h2 id="watching-heading" className={styles.sectionKicker}>
              Watching
            </h2>
            <Link href="/saved" className={styles.sectionLink}>
              All {board.status.savedCount} saved <span aria-hidden="true">→</span>
            </Link>
          </div>
          <ul className={styles.watchList}>
            {board.watching.slice(0, 3).map(({ listing, closesAt }) => {
              const days = daysUntil(closesAt, now);
              const closing = closesAt != null && days != null && days >= 0;
              return (
                <li key={listing.id}>
                  <Link href={`/listing/${listing.id}`} className={styles.watchRow}>
                    <div className={styles.watchMain}>
                      <h3>{listing.title}</h3>
                      <p>
                        {listing.host.name} · {listing.location}
                      </p>
                    </div>
                    {closing ? (
                      <span
                        className={`${styles.watchCloses} ${days <= 3 ? styles.watchClosesUrgent : ""}`}
                      >
                        Closes {formatDayDate(closesAt)}
                        {days <= 7 ? ` · ${days} day${days === 1 ? "" : "s"}` : ""}
                      </span>
                    ) : (
                      <span className={styles.watchCloses}>Open</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* Clickable pipeline: five real counts, five destinations. */}
      <nav className={styles.pipeline} aria-label="Your pipeline">
        {pipeline.map((cell) => (
          <Link key={cell.href} id={cell.id} href={cell.href} className={styles.pipelineCell}>
            <b className="ui-tabular">{cell.count}</b>
            <span>{cell.label}</span>
          </Link>
        ))}
      </nav>

      {/* Fresh matches — a doorway, not a feed. */}
      <MatchCardRail listings={board.matches.slice(0, 8)} title="Add to your season" />

      {/* Discovery, as links — never embeds (see file docblock). */}
      <nav className={styles.modes} aria-label="Ways to find work">
        <span className={styles.modesLabel}>Find more:</span>
        {DISCOVERY_MODES.map((mode) => (
          <Link key={mode.href} id={mode.id} href={mode.href} className={styles.mode}>
            <Icon name={mode.icon} size={16} aria-hidden />
            {mode.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
