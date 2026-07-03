"use client";

import Image from "next/image";
import Link from "next/link";
import { useOptimistic, useTransition } from "react";

import { BADGE_META, type SeekerBadge } from "@explore-and-earn/contracts";
import { Icon, type IconKey } from "@explore-and-earn/ui";
import { saveReadinessAction } from "../../app/actions/seekerProfile";
import type { DiscoveryListing } from "../discovery";
import type { FeaturedEmployer } from "../public/FeaturedEmployersRail";
import { FeaturedEmployerStrip } from "./FeaturedEmployerStrip";
import { MatchCardRail } from "./MatchCardRail";
import { ReadinessSlider } from "./ReadinessSlider";
import { SeekerDirectory } from "./SeekerDirectory";
import { RESUME_APPLY_THRESHOLD, type SeekerStatusSummary } from "./models";
import styles from "./ProfileHub.module.css";

// Category atmospheres are tokenized in styles/tokens.css (shared with SeekerHero).
const CATEGORY_GRADIENTS: Record<string, string> = {
  maritime: "var(--gradient-category-maritime)",
  farm:     "var(--gradient-category-farm)",
  remote:   "var(--gradient-category-remote)",
  seasonal: "var(--gradient-category-seasonal)",
  mix:      "var(--gradient-category-mix)",
};
const DEFAULT_GRADIENT = "var(--gradient-category-default)";

const CATEGORY_LABELS: Record<string, string> = {
  maritime: "Maritime",
  farm:     "Farm",
  remote:   "Remote",
  seasonal: "Seasonal",
  mix:      "Mix",
};

function formatBadgeDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** A single tappable status cell composed on the shared `ui-stat` primitive. */
interface StatCell {
  readonly href: string;
  readonly label: string;
  readonly value: string;
  readonly icon: IconKey;
  readonly mod?: "primary" | "soon";
}

/** The one next-best-action surfaced above the fold. Always resolves to one. */
interface NextAction {
  readonly tone: "primary" | "soon" | "calm";
  readonly eyebrow: string;
  readonly title: string;
  readonly sub: string;
  readonly cta: string;
  readonly icon: IconKey;
  readonly href: string;
  readonly progress?: number;
}

function resolveNextAction(status: SeekerStatusSummary, resumeReady: boolean): NextAction {
  if (status.offersCount > 0) {
    return {
      tone: "primary",
      eyebrow: "Offer waiting",
      title: status.offersCount === 1 ? "You have an offer" : `You have ${status.offersCount} offers`,
      sub: "Review and respond before they expire.",
      cta: "Review",
      icon: "status.match",
      href: "/offered",
    };
  }
  if (!resumeReady) {
    return {
      tone: "soon",
      eyebrow: "Almost there",
      title: "Finish your resume",
      sub: `${status.resumeCompletion}% — reach ${RESUME_APPLY_THRESHOLD}% to unlock applications.`,
      cta: "Continue",
      icon: "profile.resume",
      href: "/resume",
      progress: status.resumeCompletion,
    };
  }
  return {
    tone: "calm",
    eyebrow: "You're set",
    title: "You're ready to apply",
    sub: "Keep exploring opportunities matched to you.",
    cta: "Explore",
    icon: "nav.seek",
    href: "/seek",
  };
}

export interface ProfileHubProps {
  readonly status: SeekerStatusSummary;
  readonly badges?: readonly SeekerBadge[];
  readonly profilePhotoUrl?: string | null;
  readonly heroCoverUrl?: string | null;
  readonly seekingTimeline?: string | null;
  readonly preferredCategories?: readonly string[];
  readonly bio?: string | null;
  readonly seekerProfileId?: string | null;
  readonly matchedListings?: readonly DiscoveryListing[];
  readonly featuredEmployers?: readonly FeaturedEmployer[];
}

export function ProfileHub({
  status,
  badges = [],
  profilePhotoUrl,
  heroCoverUrl,
  seekingTimeline,
  preferredCategories = [],
  bio,
  seekerProfileId,
  matchedListings = [],
  featuredEmployers = [],
}: ProfileHubProps) {
  const [isPending, startTransition] = useTransition();
  const [optimisticTimeline, setOptimisticTimeline] = useOptimistic(seekingTimeline ?? null);

  const initials =
    status.seekerName
      .trim()
      .split(" ")
      .map((n) => n[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "SE";

  const resumeReady = status.resumeCompletion >= RESUME_APPLY_THRESHOLD;
  const isPhoto = Boolean(heroCoverUrl && (heroCoverUrl.startsWith("http") || heroCoverUrl.startsWith("/")));
  const heroBg = isPhoto
    ? undefined
    : (CATEGORY_GRADIENTS[preferredCategories[0] ?? ""] ?? DEFAULT_GRADIENT);

  const stats: readonly StatCell[] = [
    {
      href: "/resume",
      label: "Resume",
      value: `${status.resumeCompletion}%`,
      icon: "profile.resume",
      mod: !resumeReady && status.offersCount === 0 ? "soon" : undefined,
    },
    { href: "/saved", label: "Saved", value: String(status.savedCount), icon: "nav.saved" },
    { href: "/applied", label: "Applied", value: String(status.appliedCount), icon: "action.apply" },
    {
      href: "/offered",
      label: "Offers",
      value: String(status.offersCount),
      icon: "status.match",
      mod: status.offersCount > 0 ? "primary" : undefined,
    },
    {
      href: "/accepted",
      label: "Upcoming",
      value: status.acceptedUpcoming ? "1" : "—",
      icon: "status.accepted",
    },
  ];

  const nextAction = resolveNextAction(status, resumeReady);

  function handleReadinessChange(value: string) {
    if (!seekerProfileId) return;
    startTransition(async () => {
      setOptimisticTimeline(value);
      await saveReadinessAction(value);
    });
  }

  return (
    <div className={styles.page}>
      {/* ── Full-bleed cover ── */}
      <section
        className={styles.hero}
        style={heroBg ? { background: heroBg } : undefined}
        aria-label="Profile cover"
      >
        {isPhoto && heroCoverUrl && (
          <Image src={heroCoverUrl} alt="" fill sizes="100vw" className={styles.heroBg} priority />
        )}
        <div className={styles.heroOverlay} aria-hidden="true" />

        <div className={styles.topBar}>
          <Link href="/profile/edit" className={styles.editBtn} aria-label="Edit profile and cover">
            <Icon name="action.edit" size={16} aria-hidden />
            <span>Edit</span>
          </Link>
        </div>
      </section>

      {/* ── Identity: avatar straddles the hero/content boundary ── */}
      <div className={styles.identityBar}>
        <div className={styles.avatarWrap} aria-hidden="true">
          {profilePhotoUrl ? (
            <Image src={profilePhotoUrl} alt="" width={88} height={88} className={styles.avatarImg} />
          ) : (
            <div className={styles.avatarInitials}>{initials}</div>
          )}
        </div>

        <div className={styles.identityContent}>
          <div className={styles.nameRow}>
            <h1 className={styles.seekerName}>{status.seekerName}</h1>
            <span className={styles.seekerBadge}>
              <span className={styles.seekerDot} aria-hidden="true" />
              Seeker
            </span>
          </div>

          {preferredCategories.length > 0 && (
            <div className={styles.catPills}>
              {preferredCategories.slice(0, 3).map((cat) => (
                <span
                  key={cat}
                  className={`${styles.catPill} ${styles[`cat_${cat}` as keyof typeof styles] ?? ""}`}
                >
                  {CATEGORY_LABELS[cat] ?? cat}
                </span>
              ))}
            </div>
          )}

          {bio ? (
            <p className={styles.bio}>{bio}</p>
          ) : (
            <Link href="/profile/edit" className={styles.bioAdd}>
              + Add a bio
            </Link>
          )}
        </div>
      </div>

      {/* ── Availability / readiness ── */}
      <div className={styles.readinessWrap}>
        <ReadinessSlider value={optimisticTimeline} onChange={handleReadinessChange} saving={isPending} />
      </div>

      {/* ── Status — tappable cells on the shared ui-stat primitive ── */}
      <ul className={styles.statusRow} aria-label="Your activity">
        {stats.map((stat) => {
          const mod =
            stat.mod === "primary" ? "ui-stat--primary" : stat.mod === "soon" ? "ui-stat--soon" : "";
          return (
            <li key={stat.href}>
              <Link href={stat.href} className={`${styles.statCell} ui-stat ${mod}`}>
                <span className="ui-stat__label">
                  <Icon name={stat.icon} size={16} aria-hidden /> {stat.label}
                </span>
                <span className="ui-stat__value">{stat.value}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* ── One next-best-action — the module's dominant element ── */}
      <Link href={nextAction.href} className={`${styles.callout} ${styles[nextAction.tone]}`}>
        <span className={styles.calloutIcon} aria-hidden="true">
          <Icon name={nextAction.icon} size={24} />
        </span>
        <div className={styles.calloutText}>
          <span className={styles.calloutEyebrow}>{nextAction.eyebrow}</span>
          <span className={styles.calloutTitle}>{nextAction.title}</span>
          <span className={styles.calloutSub}>{nextAction.sub}</span>
          {nextAction.progress != null && (
            <div className={styles.progressTrack} aria-hidden="true">
              <div className={styles.progressFill} style={{ width: `${nextAction.progress}%` }} />
            </div>
          )}
        </div>
        <span className={styles.calloutCta}>
          <span className={styles.calloutCtaLabel}>{nextAction.cta}</span>
          <Icon name="action.forward" size={20} aria-hidden />
        </span>
      </Link>

      {/* ── Lower stack: matched · featured · directory · badges ── */}
      <div className={styles.stack}>
        {matchedListings.length > 0 && (
          <MatchCardRail listings={matchedListings} title="Matched for you" />
        )}

        {featuredEmployers.length > 0 && <FeaturedEmployerStrip employers={featuredEmployers} />}

        <div className={styles.directoryWrap}>
          <SeekerDirectory status={status} />
        </div>

        {badges.length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Badges</h2>
            <ul className={styles.badgeList}>
              {badges.map((b) => {
                const meta = BADGE_META[b.badgeKey];
                return (
                  <li key={b.id} className={styles.badgeItem}>
                    <span className={styles.badgeIcon} aria-hidden="true">
                      <Icon name={meta.icon as IconKey} size={20} />
                    </span>
                    <div className={styles.badgeInfo}>
                      <span className={styles.badgeName}>{meta.label}</span>
                      <span className={styles.badgeDesc}>{meta.description}</span>
                    </div>
                    <time className={styles.badgeDate} dateTime={b.awardedAt}>
                      {formatBadgeDate(b.awardedAt)}
                    </time>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
