"use client";

import Link from "next/link";
import { useCallback, useOptimistic, useState, useTransition } from "react";

import { Icon } from "@explore-and-earn/ui";
import type { SeekerProfileRecord } from "@explore-and-earn/db";
import { saveReadinessAction } from "../../app/actions/seekerProfile";
import type { FeaturedEmployer } from "../public/FeaturedEmployersRail";
import type { DiscoveryListing } from "../discovery";
import { FeaturedEmployerStrip } from "./FeaturedEmployerStrip";
import { JourneyPipeline } from "./JourneyPipeline";
import { MatchCardRail } from "./MatchCardRail";
import { QuickStats } from "./QuickStats";
import { SeekerHero } from "./SeekerHero";
import styles from "./SeekerDashboard.module.css";
import type { SeekerStatusSummary } from "./models";

export interface SeekerDashboardProps {
  readonly profile: SeekerProfileRecord | null;
  readonly status: SeekerStatusSummary;
  readonly matchedListings: readonly DiscoveryListing[];
  readonly featuredEmployers: readonly FeaturedEmployer[];
  readonly seekerName: string;
}

/* ─── Resume completion callout ─── */
function ResumeCallout({ pct }: { pct: number }) {
  const r = 14;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const ringColor = pct >= 40 ? "var(--state-soon-fg)" : "var(--accent-seasonal-fg)";

  return (
    <Link
      href="/resume"
      className={styles.resumeCallout}
      aria-label={`Complete your resume — ${pct}% done`}
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
        <p className={styles.calloutTitle}>Finish your resume</p>
        <p className={styles.calloutSub}>A complete profile gets 3× more invites</p>
      </div>
      <span className={styles.calloutCta} aria-hidden="true">Go →</span>
    </Link>
  );
}

/* ─── Lifecycle destination cards (3-up grid) ─── */
function LifecycleTeasers({ status }: { status: SeekerStatusSummary }) {
  const items = [
    {
      href: "/invites",
      label: "Invites",
      icon: "action.message" as const,
      count: status.invitesCount,
      highlight: status.invitesCount > 0,
    },
    {
      href: "/offered",
      label: "Offers",
      icon: "action.forward" as const,
      count: status.offersCount,
      highlight: status.offersCount > 0,
    },
    {
      href: "/accepted",
      label: "Accepted",
      icon: "action.apply" as const,
      count: undefined,
      highlight: Boolean(status.acceptedUpcoming),
    },
  ];

  return (
    <div className={styles.teaserRow} role="list" aria-label="Application lifecycle">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`${styles.teaserCard} ${item.highlight ? styles.teaserHighlight : ""}`}
          role="listitem"
          aria-label={item.count != null && item.count > 0 ? `${item.label}: ${item.count}` : item.label}
        >
          <div className={styles.teaserIcon}>
            <Icon name={item.icon as Parameters<typeof Icon>[0]["name"]} size={20} />
          </div>
          <div className={styles.teaserInfo}>
            {item.count != null && item.count > 0 && (
              <span className={styles.teaserCount}>{item.count}</span>
            )}
            <span className={styles.teaserLabel}>{item.label}</span>
          </div>
        </Link>
      ))}
    </div>
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
  const [heroCoverUrl, setHeroCoverUrl] = useState<string | null>(
    profile?.heroCoverUrl ?? null,
  );
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

  const handleHeroCoverChange = useCallback((url: string | null) => {
    setHeroCoverUrl(url);
  }, []);

  const initials =
    seekerName
      .split(" ")
      .map((n) => n[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "SE";

  // The Seeker OS shell (.seekeros-side) owns the persistent sidebar now, so the
  // dashboard renders a single full-width content column — no second sidebar.
  return (
    <div className={styles.main}>
        {/* Hero + readiness strip */}
        <SeekerHero
          seekerName={seekerName}
          initials={initials}
          bio={profile?.shortBio ?? null}
          avatarUrl={profile?.profilePhotoUrl ?? null}
          heroCoverUrl={heroCoverUrl}
          seekingTimeline={optimisticTimeline}
          preferredCategories={profile?.desiredCategories ?? []}
          seekerProfileId={profile?.id ?? null}
          onReadinessChange={handleReadinessChange}
          onHeroCoverChange={handleHeroCoverChange}
          readinessSaving={isPending}
        />

        {/* Journey pipeline — visual 5-step progress flow */}
        <JourneyPipeline
          matchedCount={matchedListings.length}
          savedCount={status.savedCount}
          appliedCount={status.appliedCount}
          offersCount={status.offersCount}
          acceptedUpcoming={status.acceptedUpcoming}
        />

        {/* Quick stats chips */}
        <QuickStats status={status} />

        {/* Resume nudge */}
        {status.resumeCompletion < 80 && (
          <ResumeCallout pct={status.resumeCompletion} />
        )}

        {/* Matched opportunities */}
        <MatchCardRail listings={matchedListings} />

        {/* Featured employers */}
        <FeaturedEmployerStrip employers={featuredEmployers} />

        {/* Lifecycle status cards */}
        <section className={styles.lifecycleSection} aria-label="Your applications">
          <h2 className={styles.sectionHeading}>Your Applications</h2>
          <LifecycleTeasers status={status} />
        </section>
    </div>
  );
}
