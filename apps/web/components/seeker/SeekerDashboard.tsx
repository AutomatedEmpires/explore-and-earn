"use client";

import Link from "next/link";
import { useCallback, useMemo, useOptimistic, useTransition } from "react";

import { Icon } from "@explore-and-earn/ui";
import type { SeekerProfileRecord } from "@explore-and-earn/db";
import { saveReadinessAction } from "../../app/actions/seekerProfile";
import { byMonetization } from "../../lib/ranking";
import type { FeaturedEmployer } from "../public/FeaturedEmployersRail";
import type { DiscoveryListing } from "../discovery";
import { FeaturedEmployerStrip } from "./FeaturedEmployerStrip";
import { JourneyPipeline } from "./JourneyPipeline";
import { MatchCardRail } from "./MatchCardRail";
import { ReadinessSlider } from "./ReadinessSlider";
import styles from "./SeekerDashboard.module.css";
import { RESUME_APPLY_THRESHOLD, type SeekerStatusSummary } from "./models";

export interface SeekerDashboardProps {
  readonly profile: SeekerProfileRecord | null;
  readonly status: SeekerStatusSummary;
  readonly matchedListings: readonly DiscoveryListing[];
  readonly featuredEmployers: readonly FeaturedEmployer[];
  readonly seekerName: string;
}

/* ─── Monetization helpers (shared "pay more, show more" util) ─── */

/** Map a listing onto the shared MonetizationInputs the ranking util consumes. */
function monetizationInputs(listing: DiscoveryListing) {
  return {
    boosted: listing.conditionalBadges?.includes("boosted") ?? false,
    hostTier: listing.host.tier,
    matchScore: listing.matchScore,
  };
}

/** A listing is "promoted" when it is boosted or from a paid-tier host. */
function isPromoted(listing: DiscoveryListing): boolean {
  return (
    (listing.conditionalBadges?.includes("boosted") ?? false) ||
    (listing.host.tier != null && listing.host.tier !== "none")
  );
}

/* ─── Next action ─── */

type ActionTone = "offer" | "invite" | "accepted" | "resume" | "match" | "explore";

interface NextAction {
  readonly tone: ActionTone;
  readonly headline: string;
  readonly ctaLabel: string;
  readonly href: string;
}

/**
 * The ONE thing this seeker should do next — presentation prioritization only,
 * derived entirely from their real status counts (never a fabricated score).
 * Priority mirrors the Seeker Home spec: offer → invite → accepted → résumé →
 * fresh matches → explore.
 */
function resolveNextAction(
  status: SeekerStatusSummary,
  hasMatches: boolean,
): NextAction {
  const plural = (n: number) => (n > 1 ? "s" : "");

  if (status.offersCount > 0) {
    return {
      tone: "offer",
      headline: `You have ${status.offersCount} offer${plural(status.offersCount)} to review`,
      ctaLabel: "Review offers",
      href: "/offered",
    };
  }
  if (status.invitesCount > 0) {
    return {
      tone: "invite",
      headline: `${status.invitesCount} host${plural(status.invitesCount)} invited you to apply`,
      ctaLabel: "See invites",
      href: "/invites",
    };
  }
  if (status.acceptedUpcoming) {
    return {
      tone: "accepted",
      headline: `You're headed to ${status.acceptedUpcoming}`,
      ctaLabel: "View details",
      href: "/accepted",
    };
  }
  if (status.resumeCompletion < RESUME_APPLY_THRESHOLD) {
    return {
      tone: "resume",
      headline: "Finish your résumé to start applying",
      ctaLabel: "Complete résumé",
      href: "/resume",
    };
  }
  if (hasMatches) {
    return {
      tone: "match",
      headline: "Fresh opportunities match your profile",
      ctaLabel: "See your matches",
      href: "/seek",
    };
  }
  return {
    tone: "explore",
    headline: "Ready to find your next adventure?",
    ctaLabel: "Start swiping",
    href: "/swipe",
  };
}

const TONE_ICON = {
  offer: "status.offered",
  invite: "status.match",
  accepted: "status.accepted",
  resume: "action.edit",
  match: "nav.seek",
  explore: "nav.swipe",
} as const;

function NextActionBanner({
  seekerName,
  action,
}: {
  readonly seekerName: string;
  readonly action: NextAction;
}) {
  const firstName = seekerName.trim().split(/\s+/)[0] || "there";
  return (
    <section
      className={styles.hero}
      data-tone={action.tone}
      aria-labelledby="seeker-next-action"
    >
      <p className={styles.greeting}>Welcome back, {firstName}</p>
      <h1 id="seeker-next-action" className={styles.headline}>
        {action.headline}
      </h1>
      <Link href={action.href} className={styles.heroCta}>
        <Icon name={TONE_ICON[action.tone]} size={18} aria-hidden />
        {action.ctaLabel}
        <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}

/* ─── Resume completion callout (soft nudge, 70–79%) ─── */
function ResumeCallout({ pct }: { pct: number }) {
  const r = 14;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const ringColor = pct >= 40 ? "var(--state-soon-fg)" : "var(--accent-seasonal-fg)";

  return (
    <Link
      href="/resume"
      className={styles.resumeCallout}
      aria-label={`Complete your résumé — ${pct}% done`}
    >
      <div className={styles.calloutRing}>
        <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">
          <circle cx="18" cy="18" r={r} stroke="var(--border-soft)" strokeWidth="3" fill="none" />
          <circle
            cx="18" cy="18" r={r}
            stroke={ringColor} strokeWidth="3" fill="none"
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeLinecap="round"
            transform="rotate(-90 18 18)"
          />
          <text x="18" y="22" textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--benefit-pay-fg)">
            {pct}%
          </text>
        </svg>
      </div>
      <div className={styles.calloutText}>
        <p className={styles.calloutTitle}>Finish your résumé</p>
        <p className={styles.calloutSub}>A complete profile gets 3× more invites</p>
      </div>
      <span className={styles.calloutCta} aria-hidden="true">Go →</span>
    </Link>
  );
}

/* ─── Root dashboard ─── */
export function SeekerDashboard({
  profile,
  status,
  matchedListings,
  featuredEmployers,
  seekerName,
}: SeekerDashboardProps) {
  const [isPending, startTransition] = useTransition();
  const [optimisticTimeline, setOptimisticTimeline] = useOptimistic<string | null>(
    profile?.seekingTimeline ?? null,
  );

  const handleReadinessChange = useCallback(
    (value: string) => {
      startTransition(async () => {
        setOptimisticTimeline(value);
        await saveReadinessAction(value);
      });
    },
    [setOptimisticTimeline],
  );

  // Order both rails by the shared "pay more, show more" util (boosted >
  // enterprise > strong match > professional > starter); ties keep the incoming
  // best-match-first order (stable sort). The rails are then partitioned so a
  // listing never appears in both.
  const { matchedOnly, promoted } = useMemo(() => {
    const ranked = [...matchedListings].sort(byMonetization(monetizationInputs));
    const promotedList = ranked.filter(isPromoted).slice(0, 8);
    const promotedIds = new Set(promotedList.map((l) => l.id));
    return {
      promoted: promotedList,
      matchedOnly: ranked.filter((l) => !promotedIds.has(l.id)).slice(0, 12),
    };
  }, [matchedListings]);

  const hasMatches = matchedListings.length > 0;
  const action = resolveNextAction(status, hasMatches);

  // The next-action banner already surfaces an incomplete résumé (<70%) and any
  // pending offer, so only show the softer résumé nudge for the 70–79% band.
  const showResumeCallout =
    action.tone !== "resume" && status.resumeCompletion < 80;

  return (
    <div className={styles.main}>
      {/* Lead: welcome + the ONE next action. */}
      <NextActionBanner seekerName={seekerName} action={action} />

      {/* Availability — a small personalization control ("it knows my season"). */}
      <ReadinessSlider
        value={optimisticTimeline}
        onChange={handleReadinessChange}
        saving={isPending}
      />

      {/* Clickable pipeline — each stage routes to its own view. */}
      <section className={styles.pipelineSection} aria-labelledby="pipeline-heading">
        <div className={styles.pipelineHeader}>
          <h2 id="pipeline-heading" className={styles.pipelineHeading}>Your pipeline</h2>
          <Link href="/applied" className={styles.pipelineLink}>
            All applications <span aria-hidden="true">→</span>
          </Link>
        </div>
        <JourneyPipeline
          matchedCount={matchedListings.length}
          savedCount={status.savedCount}
          appliedCount={status.appliedCount}
          offersCount={status.offersCount}
          acceptedUpcoming={status.acceptedUpcoming}
        />
      </section>

      {/* Résumé readiness (soft nudge). */}
      {showResumeCallout && <ResumeCallout pct={status.resumeCompletion} />}

      {/* Their matched opportunities. When there are no matches at all, the rail
          renders its own honest empty state prompting résumé completion. */}
      {hasMatches ? (
        matchedOnly.length > 0 && (
          <MatchCardRail listings={matchedOnly} title="Matched for you" />
        )
      ) : (
        <MatchCardRail listings={[]} title="Matched for you" />
      )}

      {/* Boosted picks — promoted inventory only, ordered by monetization. */}
      {promoted.length > 0 && (
        <MatchCardRail listings={promoted} title="Boosted picks" />
      )}

      {/* Featured employers. */}
      <FeaturedEmployerStrip employers={featuredEmployers} />
    </div>
  );
}
